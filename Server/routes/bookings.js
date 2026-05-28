const express = require("express");
const db = require("../db");
const { MAX_GUESTS, validatePersonName, maxBookingDateISO } = require("../constants");
const { TARIFFS, getRoom, getAvailableUnits } = require("../roomStore");
const { optionalAuth } = require("../middleware/optionalAuth");

const router = express.Router();

function localISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseISODate(value) {
  const parts = String(value).trim().split("-");
  if (parts.length !== 3) return null;

  const y = Number(parts[0]);
  const m = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  const date = new Date(y, m, d);

  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;

  return date;
}

function nightsBetween(checkIn, checkOut) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((checkOut.getTime() - checkIn.getTime()) / msPerDay);
}

function normalizePayload(body) {
  return {
    guestName: String(body.guestName || body.name || "").trim(),
    phone: String(body.phone || "").trim(),
    email: String(body.email || "").trim(),
    roomSlug: String(body.roomSlug || body.room_slug || body.roomType || body["room-type"] || "").trim(),
    tariff: String(body.tariff || "basic").trim(),
    checkIn: String(body.checkIn || body.checkin || body["check-in"] || "").trim(),
    checkOut: String(body.checkOut || body.checkout || body["check-out"] || "").trim(),
    guests: Number(body.guests),
  };
}

async function validateBookingPayload(payload) {
  const errors = [];

  if (!payload.guestName) errors.push("Укажите имя гостя.");
  else {
    const guestNameError = validatePersonName(payload.guestName, true);
    if (guestNameError) errors.push(guestNameError);
  }
  if (!payload.phone) errors.push("Укажите телефон.");
  if (!payload.roomSlug) errors.push("Укажите тип номера.");
  if (!payload.checkIn) errors.push("Укажите дату заезда.");
  if (!payload.checkOut) errors.push("Укажите дату выезда.");
  if (!Number.isInteger(payload.guests) || payload.guests < 1 || payload.guests > MAX_GUESTS) {
    errors.push(`Количество гостей должно быть от 1 до ${MAX_GUESTS}.`);
  }

  if (errors.length) return { errors };

  const room = await getRoom(payload.roomSlug, { visibleOnly: false });
  if (!room) {
    errors.push("Неизвестный тип номера.");
  } else if (!room.isAvailable) {
    errors.push("Выбранный номер временно недоступен.");
  }
  if (!TARIFFS.includes(payload.tariff)) errors.push("Неизвестный тариф.");

  const checkInDate = parseISODate(payload.checkIn);
  const checkOutDate = parseISODate(payload.checkOut);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!checkInDate) errors.push("Некорректная дата заезда.");
  if (!checkOutDate) errors.push("Некорректная дата выезда.");

  if (checkInDate && checkInDate < today) {
    errors.push("Дата заезда не может быть в прошлом.");
  }

  const maxBookingDate = parseISODate(maxBookingDateISO());
  if (checkInDate && maxBookingDate && checkInDate > maxBookingDate) {
    errors.push("Дата заезда не может быть более чем на 2 года вперёд.");
  }
  if (checkOutDate && maxBookingDate && checkOutDate > maxBookingDate) {
    errors.push("Дата выезда не может быть более чем на 2 года вперёд.");
  }

  if (checkInDate && checkOutDate && checkOutDate <= checkInDate) {
    errors.push("Дата выезда должна быть позже даты заезда.");
  }

  if (room && Number.isInteger(payload.guests) && payload.guests > room.maxGuests) {
    errors.push(`Для этого номера допустимо не более ${room.maxGuests} гостей.`);
  }

  if (errors.length) return { errors };

  const nights = nightsBetween(checkInDate, checkOutDate);
  const availableUnits = await getAvailableUnits(
    payload.roomSlug,
    payload.checkIn,
    payload.checkOut
  );

  if (availableUnits <= 0) {
    errors.push("На выбранные даты этот номер недоступен.");
    return { errors };
  }

  const pricePerNight = room.prices[payload.tariff];
  const totalPrice = pricePerNight * nights;

  return {
    data: {
      guestName: payload.guestName,
      phone: payload.phone,
      email: payload.email || null,
      roomSlug: payload.roomSlug,
      roomName: room.name,
      tariff: payload.tariff,
      checkIn: payload.checkIn,
      checkOut: payload.checkOut,
      guests: payload.guests,
      nights,
      pricePerNight,
      totalPrice,
    },
  };
}

router.get("/rooms", async function (req, res, next) {
  try {
    const { listRooms } = require("../roomStore");
    const rooms = await listRooms({ visibleOnly: true });
    res.json({ rooms });
  } catch (err) {
    next(err);
  }
});

router.post("/", optionalAuth, async function (req, res, next) {
  try {
    const validation = await validateBookingPayload(normalizePayload(req.body || {}));

    if (validation.errors) {
      return res.status(400).json({ errors: validation.errors });
    }

    const booking = validation.data;
    const authUser = req.authUser;
    const userId = authUser ? authUser.id || authUser.userId : null;
    const bookingEmail = authUser ? authUser.email : booking.email;

    const result = await db.withTransaction(async function () {
      const availableUnits = await getAvailableUnits(
        booking.roomSlug,
        booking.checkIn,
        booking.checkOut
      );

      if (availableUnits <= 0) {
        const error = new Error("UNAVAILABLE");
        error.code = "UNAVAILABLE";
        throw error;
      }

      return db.run(
        `INSERT INTO bookings (
          guest_name,
          phone,
          email,
          room_slug,
          room_name,
          tariff,
          check_in,
          check_out,
          guests,
          nights,
          price_per_night,
          total_price,
          user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          booking.guestName,
          booking.phone,
          bookingEmail || null,
          booking.roomSlug,
          booking.roomName,
          booking.tariff,
          booking.checkIn,
          booking.checkOut,
          booking.guests,
          booking.nights,
          booking.pricePerNight,
          booking.totalPrice,
          userId,
        ]
      );
    });

    res.status(201).json({
      message: "Бронирование успешно создано.",
      booking: {
        id: result.id,
        ...booking,
        email: bookingEmail || null,
        userId: userId,
        status: "pending",
        createdAt: localISODate(new Date()),
      },
    });
  } catch (err) {
    if (err.code === "UNAVAILABLE") {
      return res.status(409).json({ errors: ["На выбранные даты этот номер недоступен."] });
    }
    next(err);
  }
});

module.exports = router;
