const express = require("express");
const db = require("../db");

const router = express.Router();

const { getServiceMaxGuests, validatePersonName, isBookingDateWithinRange } = require("../constants");
const { optionalAuth } = require("../middleware/optionalAuth");

const BOOKABLE_SERVICES = {
  "conference-hall": "Конференц-зал",
  "sauna-pool": "Сауна с бассейном",
};

function bookedMessage(slug) {
  if (slug === "sauna-pool") {
    return "Бронирование в этот день невозможно: на выбранную дату сауна уже занята.";
  }
  if (slug === "conference-hall") {
    return "Бронирование в этот день невозможно: на выбранную дату конференц-зал уже занят.";
  }
  return "Бронирование в этот день невозможно.";
}

function calculateTotalPrice(slug, hours) {
  const value = Number(hours) || 1;
  const safeHours = Math.max(1, Math.min(24, Math.floor(value)));

  if (slug === "conference-hall") {
    return safeHours * 720;
  }

  if (slug === "sauna-pool") {
    if (safeHours <= 1) return 1800;
    if (safeHours === 2) return 3600;
    return 3600 + (safeHours - 2) * 1200;
  }

  return 0;
}

function parseISODate(value) {
  const parts = String(value || "").trim().split("-");
  if (parts.length !== 3) return null;

  const y = Number(parts[0]);
  const m = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  const date = new Date(y, m, d);

  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;

  return date;
}

router.get("/", async function (req, res, next) {
  try {
    const rows = await db.all(
      `SELECT
        id,
        slug,
        title,
        category,
        description,
        price_text AS priceText,
        sort_order AS sortOrder
      FROM services
      WHERE is_active = 1
      ORDER BY sort_order ASC, id ASC`
    );

    res.json({ services: rows });
  } catch (err) {
    next(err);
  }
});

router.get("/availability", async function (req, res, next) {
  try {
    const slug = String(req.query.slug || "").trim();
    const bookingDate = String(req.query.date || req.query.bookingDate || "").trim();

    if (!BOOKABLE_SERVICES[slug]) {
      return res.status(400).json({ error: "Эту услугу нельзя забронировать онлайн." });
    }

    if (!bookingDate) {
      return res.status(400).json({ error: "Укажите дату бронирования." });
    }

    const date = parseISODate(bookingDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!date) {
      return res.status(400).json({ error: "Некорректная дата." });
    }

    if (date < today) {
      return res.status(400).json({ error: "Дата не может быть в прошлом." });
    }

    if (!isBookingDateWithinRange(bookingDate)) {
      return res.status(400).json({ error: "Дата не может быть более чем на 2 года вперёд." });
    }

    const row = await db.get(
      `SELECT id FROM service_bookings
       WHERE service_slug = ? AND booking_date = ? AND status != 'cancelled'`,
      [slug, bookingDate]
    );

    const booked = Boolean(row);

    res.json({
      slug: slug,
      serviceName: BOOKABLE_SERVICES[slug],
      bookingDate: bookingDate,
      available: !booked,
      message: booked ? bookedMessage(slug) : "",
    });
  } catch (err) {
    next(err);
  }
});

router.post("/bookings", optionalAuth, async function (req, res, next) {
  try {
    const slug = String(req.body.serviceSlug || req.body.slug || "").trim();
    const bookingDate = String(req.body.bookingDate || req.body.date || "").trim();
    const guestName = String(req.body.guestName || req.body.name || "").trim();
    const phone = String(req.body.phone || "").trim();
    const email = String(req.body.email || "").trim();
    const hours = Number(req.body.hours);
    const guests = Number(req.body.guests);
    const errors = [];

    if (!BOOKABLE_SERVICES[slug]) {
      errors.push("Эту услугу нельзя забронировать онлайн.");
    }

    if (!bookingDate) errors.push("Укажите дату бронирования.");
    if (!guestName) errors.push("Укажите имя.");
    else {
      const guestNameError = validatePersonName(guestName, true);
      if (guestNameError) errors.push(guestNameError);
    }
    if (!phone) errors.push("Укажите телефон.");
    if (!Number.isInteger(hours) || hours < 1 || hours > 24) {
      errors.push("Укажите количество часов от 1 до 24.");
    }

    const maxGuests = getServiceMaxGuests(slug);
    if (!Number.isInteger(guests) || guests < 1 || guests > maxGuests) {
      errors.push(`Количество гостей для этой услуги — от 1 до ${maxGuests}.`);
    }

    if (errors.length) {
      return res.status(400).json({ errors: errors });
    }

    const date = parseISODate(bookingDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!date) {
      return res.status(400).json({ errors: ["Некорректная дата."] });
    }

    if (date < today) {
      return res.status(400).json({ errors: ["Дата не может быть в прошлом."] });
    }

    if (!isBookingDateWithinRange(bookingDate)) {
      return res.status(400).json({ errors: ["Дата не может быть более чем на 2 года вперёд."] });
    }

    const authUser = req.authUser;
    const userId = authUser ? authUser.id || authUser.userId : null;
    const bookingEmail = authUser ? authUser.email : email || null;

    let result;

    try {
      result = await db.run(
        `INSERT INTO service_bookings (
          service_slug, service_name, guest_name, phone, email, booking_date, hours, guests, total_price, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          slug,
          BOOKABLE_SERVICES[slug],
          guestName,
          phone,
          bookingEmail,
          bookingDate,
          hours,
          guests,
          calculateTotalPrice(slug, hours),
          userId,
        ]
      );
    } catch (insertError) {
      if (String(insertError.message || "").includes("UNIQUE constraint failed")) {
        return res.status(409).json({
          error: bookedMessage(slug),
          message: bookedMessage(slug),
        });
      }
      throw insertError;
    }

    res.status(201).json({
      message: "Бронирование услуги успешно создано.",
      booking: {
        id: result.id,
        serviceSlug: slug,
        serviceName: BOOKABLE_SERVICES[slug],
        guestName: guestName,
        phone: phone,
        email: bookingEmail,
        userId: userId,
        bookingDate: bookingDate,
        hours: hours,
        guests: guests,
        totalPrice: calculateTotalPrice(slug, hours),
        status: "pending",
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
