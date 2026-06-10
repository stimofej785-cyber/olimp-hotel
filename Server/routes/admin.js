const express = require("express");
const { clampGuestCount } = require("../constants");
const db = require("../db");
const { getAdminRoomMetrics } = require("../roomStore");
const { revokeAllUserSessions } = require("../middleware/adminAuth");
const { deleteUserCompletely } = require("../utils/deleteUser");
const { requireAdmin } = require("../middleware/adminAuth");
const {
  formatConferencePriceText,
  formatSaunaPriceText,
} = require("../servicePricing");

function localISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysISO(isoDate, days) {
  const parts = String(isoDate).split("-");
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  date.setDate(date.getDate() + days);
  return localISODate(date);
}

const router = express.Router();

function toBool(value) {
  return value === 1 || value === true;
}

function mapAdminRoom(row) {
  const totalUnits = Number(row.totalUnits) || 0;
  const availableToday =
    row.availableToday != null ? Number(row.availableToday) : null;
  const occupiedToday =
    row.occupiedToday != null
      ? Number(row.occupiedToday)
      : availableToday != null
        ? Math.max(0, totalUnits - availableToday)
        : null;

  return Object.assign({}, row, {
    isVisible: toBool(row.isVisible),
    isAvailable: toBool(row.isAvailable),
    totalUnits: totalUnits,
    activeBookings: Number(row.activeBookings) || 0,
    availableToday: availableToday,
    occupiedToday: occupiedToday,
  });
}

function mapAdminService(row) {
  return Object.assign({}, row, {
    isActive: toBool(row.isActive),
    pricePerHour: row.pricePerHour != null ? Number(row.pricePerHour) : null,
    priceExtraHour: row.priceExtraHour != null ? Number(row.priceExtraHour) : null,
  });
}

function mapAdminUser(row) {
  return Object.assign({}, row, {
    isBlocked: toBool(row.isBlocked),
  });
}

router.get("/stats", requireAdmin, async function (req, res, next) {
  try {
    const [bookings, reviews, services, rooms, users, inquiries] = await Promise.all([
      db.get(`SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed
      FROM bookings`),
      db.get(`SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved
      FROM reviews`),
      db.get(`SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active
      FROM services`),
      db.get(`SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN is_visible = 1 AND is_available = 1 THEN 1 ELSE 0 END) AS active
      FROM rooms`),
      db.get(`SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN is_blocked = 1 THEN 1 ELSE 0 END) AS blocked
      FROM users WHERE role = 'user'`),
      db.get(`SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS pending
      FROM inquiries`),
    ]);

    res.json({
      bookings: {
        total: Number(bookings.total) || 0,
        pending: Number(bookings.pending) || 0,
        confirmed: Number(bookings.confirmed) || 0,
      },
      reviews: {
        total: Number(reviews.total) || 0,
        pending: Number(reviews.pending) || 0,
        approved: Number(reviews.approved) || 0,
      },
      services: {
        total: Number(services.total) || 0,
        active: Number(services.active) || 0,
      },
      rooms: {
        total: Number(rooms.total) || 0,
        active: Number(rooms.active) || 0,
      },
      users: {
        total: Number(users.total) || 0,
        blocked: Number(users.blocked) || 0,
      },
      inquiries: {
        total: Number(inquiries.total) || 0,
        pending: Number(inquiries.pending) || 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/bookings", requireAdmin, async function (req, res, next) {
  try {
    const status = String(req.query.status || "").trim();
    let sql = `SELECT
      id,
      guest_name AS guestName,
      phone,
      email,
      room_slug AS roomSlug,
      room_name AS roomName,
      tariff,
      check_in AS checkIn,
      check_out AS checkOut,
      guests,
      nights,
      price_per_night AS pricePerNight,
      total_price AS totalPrice,
      status,
      created_at AS createdAt
    FROM bookings`;
    const params = [];

    if (status) {
      sql += " WHERE status = ?";
      params.push(status);
    }

    sql += " ORDER BY id DESC";
    const rows = await db.all(sql, params);
    res.json({ bookings: rows });
  } catch (err) {
    next(err);
  }
});

router.patch("/bookings/:id", requireAdmin, async function (req, res, next) {
  try {
    const allowed = ["pending", "confirmed", "cancelled", "completed"];
    const status = String(req.body.status || "").trim();

    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Недопустимый статус бронирования." });
    }

    const result = await db.run("UPDATE bookings SET status = ? WHERE id = ?", [
      status,
      req.params.id,
    ]);

    if (!result.changes) {
      return res.status(404).json({ error: "Бронирование не найдено." });
    }

    res.json({ message: "Статус бронирования обновлён." });
  } catch (err) {
    next(err);
  }
});

router.delete("/bookings/:id", requireAdmin, async function (req, res, next) {
  try {
    const result = await db.run("DELETE FROM bookings WHERE id = ?", [req.params.id]);

    if (!result.changes) {
      return res.status(404).json({ error: "Бронирование не найдено." });
    }

    res.json({ message: "Бронирование удалено." });
  } catch (err) {
    next(err);
  }
});

router.get("/service-bookings", requireAdmin, async function (req, res, next) {
  try {
    const status = String(req.query.status || "").trim();
    const slug = String(req.query.slug || "").trim();
    let sql = `SELECT
      id,
      service_slug AS serviceSlug,
      service_name AS serviceName,
      guest_name AS guestName,
      phone,
      email,
      booking_date AS bookingDate,
      hours,
      guests,
      total_price AS totalPrice,
      status,
      user_id AS userId,
      created_at AS createdAt
    FROM service_bookings`;
    const params = [];
    const conditions = [];

    if (status) {
      conditions.push("status = ?");
      params.push(status);
    }

    if (slug) {
      conditions.push("service_slug = ?");
      params.push(slug);
    }

    if (conditions.length) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY booking_date ASC, id DESC";
    const rows = await db.all(sql, params);
    res.json({ serviceBookings: rows });
  } catch (err) {
    next(err);
  }
});

router.patch("/service-bookings/:id", requireAdmin, async function (req, res, next) {
  try {
    const allowed = ["pending", "confirmed", "cancelled", "completed"];
    const status = String(req.body.status || "").trim();

    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Недопустимый статус бронирования." });
    }

    const result = await db.run("UPDATE service_bookings SET status = ? WHERE id = ?", [
      status,
      req.params.id,
    ]);

    if (!result.changes) {
      return res.status(404).json({ error: "Бронирование услуги не найдено." });
    }

    res.json({ message: "Статус бронирования услуги обновлён." });
  } catch (err) {
    next(err);
  }
});

router.delete("/service-bookings/:id", requireAdmin, async function (req, res, next) {
  try {
    const result = await db.run("DELETE FROM service_bookings WHERE id = ?", [req.params.id]);

    if (!result.changes) {
      return res.status(404).json({ error: "Бронирование услуги не найдено." });
    }

    res.json({ message: "Бронирование услуги удалено." });
  } catch (err) {
    next(err);
  }
});

router.get("/reviews", requireAdmin, async function (req, res, next) {
  try {
    const status = String(req.query.status || "").trim();
    let sql = `SELECT
      id,
      author_name AS authorName,
      room_type AS roomType,
      rating,
      message,
      status,
      created_at AS createdAt
    FROM reviews`;
    const params = [];

    if (status) {
      sql += " WHERE status = ?";
      params.push(status);
    }

    sql += " ORDER BY id DESC";
    const rows = await db.all(sql, params);
    res.json({ reviews: rows });
  } catch (err) {
    next(err);
  }
});

router.patch("/reviews/:id", requireAdmin, async function (req, res, next) {
  try {
    const allowed = ["pending", "approved", "rejected"];
    const status = String(req.body.status || "").trim();

    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Недопустимый статус отзыва." });
    }

    const result = await db.run("UPDATE reviews SET status = ? WHERE id = ?", [
      status,
      req.params.id,
    ]);

    if (!result.changes) {
      return res.status(404).json({ error: "Отзыв не найден." });
    }

    res.json({ message: "Статус отзыва обновлён." });
  } catch (err) {
    next(err);
  }
});

router.delete("/reviews/:id", requireAdmin, async function (req, res, next) {
  try {
    const result = await db.run("DELETE FROM reviews WHERE id = ?", [req.params.id]);

    if (!result.changes) {
      return res.status(404).json({ error: "Отзыв не найден." });
    }

    res.json({ message: "Отзыв удалён." });
  } catch (err) {
    next(err);
  }
});

router.get("/services", requireAdmin, async function (req, res, next) {
  try {
    const rows = await db.all(
      `SELECT
        id,
        slug,
        title,
        category,
        description,
        price_text AS priceText,
        price_per_hour AS pricePerHour,
        price_extra_hour AS priceExtraHour,
        is_active AS isActive,
        sort_order AS sortOrder,
        created_at AS createdAt
      FROM services
      ORDER BY sort_order ASC, id ASC`
    );

    res.json({ services: rows.map(mapAdminService) });
  } catch (err) {
    next(err);
  }
});

router.post("/services", requireAdmin, function (req, res) {
  res.status(403).json({ error: "Добавление новых услуг отключено. Доступно только редактирование существующих." });
});

router.patch("/services/:id", requireAdmin, async function (req, res, next) {
  try {
    const current = await db.get(
      "SELECT slug, price_per_hour, price_extra_hour FROM services WHERE id = ?",
      [req.params.id]
    );

    if (!current) {
      return res.status(404).json({ error: "Услуга не найдена." });
    }

    const fields = [];
    const params = [];
    const slug = req.body.slug !== undefined ? String(req.body.slug).trim() : current.slug;
    let pricePerHour =
      req.body.pricePerHour !== undefined ? Number(req.body.pricePerHour) : Number(current.price_per_hour);
    let priceExtraHour =
      req.body.priceExtraHour !== undefined
        ? Number(req.body.priceExtraHour)
        : Number(current.price_extra_hour);

    if (req.body.slug !== undefined) {
      fields.push("slug = ?");
      params.push(slug);
    }
    if (req.body.title !== undefined) {
      fields.push("title = ?");
      params.push(String(req.body.title).trim());
    }
    if (req.body.category !== undefined) {
      fields.push("category = ?");
      params.push(String(req.body.category).trim());
    }
    if (req.body.description !== undefined) {
      fields.push("description = ?");
      params.push(String(req.body.description).trim());
    }
    if (req.body.priceText !== undefined) {
      fields.push("price_text = ?");
      params.push(String(req.body.priceText).trim());
    }
    if (req.body.pricePerHour !== undefined) {
      if (!Number.isFinite(pricePerHour) || pricePerHour <= 0) {
        return res.status(400).json({ error: "Укажите корректную цену за час." });
      }
      fields.push("price_per_hour = ?");
      params.push(pricePerHour);
    }
    if (req.body.priceExtraHour !== undefined) {
      if (!Number.isFinite(priceExtraHour) || priceExtraHour < 0) {
        return res.status(400).json({ error: "Укажите корректную цену за 3-й час." });
      }
      fields.push("price_extra_hour = ?");
      params.push(priceExtraHour);
    }
    if (req.body.sortOrder !== undefined) {
      fields.push("sort_order = ?");
      params.push(Number(req.body.sortOrder) || 0);
    }
    if (req.body.isActive !== undefined) {
      fields.push("is_active = ?");
      params.push(req.body.isActive ? 1 : 0);
    }

    if (
      req.body.priceText === undefined &&
      (req.body.pricePerHour !== undefined || req.body.priceExtraHour !== undefined)
    ) {
      if (slug === "sauna-pool") {
        fields.push("price_text = ?");
        params.push(formatSaunaPriceText(pricePerHour, priceExtraHour));
      } else if (slug === "conference-hall" && req.body.pricePerHour !== undefined) {
        fields.push("price_text = ?");
        params.push(formatConferencePriceText(pricePerHour));
      }
    }

    if (!fields.length) {
      return res.status(400).json({ error: "Нет данных для обновления." });
    }

    params.push(req.params.id);
    const result = await db.run(`UPDATE services SET ${fields.join(", ")} WHERE id = ?`, params);

    if (!result.changes) {
      return res.status(404).json({ error: "Услуга не найдена." });
    }

    res.json({ message: "Услуга обновлена." });
  } catch (err) {
    next(err);
  }
});

router.delete("/services/:id", requireAdmin, async function (req, res, next) {
  try {
    const result = await db.run("DELETE FROM services WHERE id = ?", [req.params.id]);

    if (!result.changes) {
      return res.status(404).json({ error: "Услуга не найдена." });
    }

    res.json({ message: "Услуга удалена." });
  } catch (err) {
    next(err);
  }
});

router.get("/rooms", requireAdmin, async function (req, res, next) {
  try {
    const rows = await db.all(
      `SELECT
        id,
        slug,
        title,
        category,
        price_per_night AS pricePerNight,
        price_half_board AS priceHalfBoard,
        price_full_board AS priceFullBoard,
        max_guests AS maxGuests,
        description,
        image_url AS imageUrl,
        is_visible AS isVisible,
        is_available AS isAvailable,
        total_units AS totalUnits,
        sort_order AS sortOrder,
        created_at AS createdAt
      FROM rooms
      ORDER BY sort_order ASC, id ASC`
    );

    const enriched = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const metrics = await getAdminRoomMetrics(row.slug);

      enriched.push(
        mapAdminRoom(
          Object.assign({}, row, {
            totalUnits: metrics.totalUnits,
            activeBookings: metrics.activeBookings,
            availableToday: metrics.availableToday,
            occupiedToday: metrics.occupiedToday,
          })
        )
      );
    }

    res.json({ rooms: enriched });
  } catch (err) {
    next(err);
  }
});

router.post("/rooms", requireAdmin, function (req, res) {
  res.status(403).json({ error: "Добавление новых номеров отключено. Доступно только редактирование существующих." });
});

router.patch("/rooms/:id", requireAdmin, async function (req, res, next) {
  try {
    const fields = [];
    const params = [];

    if (req.body.slug !== undefined) {
      fields.push("slug = ?");
      params.push(String(req.body.slug).trim());
    }
    if (req.body.title !== undefined) {
      fields.push("title = ?");
      params.push(String(req.body.title).trim());
    }
    if (req.body.category !== undefined) {
      fields.push("category = ?");
      params.push(String(req.body.category).trim());
    }
    if (req.body.pricePerNight !== undefined) {
      fields.push("price_per_night = ?");
      params.push(Number(req.body.pricePerNight) || 0);
    }
    if (req.body.priceHalfBoard !== undefined) {
      fields.push("price_half_board = ?");
      params.push(Number(req.body.priceHalfBoard) || 0);
    }
    if (req.body.priceFullBoard !== undefined) {
      fields.push("price_full_board = ?");
      params.push(Number(req.body.priceFullBoard) || 0);
    }
    if (req.body.maxGuests !== undefined) {
      fields.push("max_guests = ?");
      params.push(clampGuestCount(Number(req.body.maxGuests) || 1));
    }
    if (req.body.description !== undefined) {
      fields.push("description = ?");
      params.push(String(req.body.description).trim());
    }
    if (req.body.imageUrl !== undefined) {
      fields.push("image_url = ?");
      params.push(String(req.body.imageUrl).trim());
    }
    if (req.body.sortOrder !== undefined) {
      fields.push("sort_order = ?");
      params.push(Number(req.body.sortOrder) || 0);
    }
    if (req.body.isVisible !== undefined) {
      fields.push("is_visible = ?");
      params.push(req.body.isVisible ? 1 : 0);
    }
    if (req.body.isAvailable !== undefined) {
      fields.push("is_available = ?");
      params.push(req.body.isAvailable ? 1 : 0);
    }
    if (req.body.totalUnits !== undefined) {
      const totalUnits = Number(req.body.totalUnits);
      if (!Number.isInteger(totalUnits) || totalUnits < 0) {
        return res.status(400).json({ error: "Количество номеров должно быть целым числом от 0." });
      }
      fields.push("total_units = ?");
      params.push(totalUnits);
    }

    if (!fields.length) {
      return res.status(400).json({ error: "Нет данных для обновления." });
    }

    params.push(req.params.id);
    const result = await db.run(`UPDATE rooms SET ${fields.join(", ")} WHERE id = ?`, params);

    if (!result.changes) {
      return res.status(404).json({ error: "Номер не найден." });
    }

    res.json({ message: "Номер обновлён." });
  } catch (err) {
    next(err);
  }
});

router.delete("/rooms/:id", requireAdmin, async function (req, res, next) {
  try {
    const result = await db.run("DELETE FROM rooms WHERE id = ?", [req.params.id]);

    if (!result.changes) {
      return res.status(404).json({ error: "Номер не найден." });
    }

    res.json({ message: "Номер удалён." });
  } catch (err) {
    next(err);
  }
});

router.get("/users", requireAdmin, async function (req, res, next) {
  try {
    const rows = await db.all(
      `SELECT
        id,
        email,
        first_name AS firstName,
        last_name AS lastName,
        phone,
        role,
        is_blocked AS isBlocked,
        created_at AS createdAt,
        last_login_at AS lastLoginAt
      FROM users
      ORDER BY id DESC`
    );
    res.json({ users: rows.map(mapAdminUser) });
  } catch (err) {
    next(err);
  }
});

router.patch("/users/:id", requireAdmin, async function (req, res, next) {
  try {
    const user = await db.get("SELECT id, role FROM users WHERE id = ?", [req.params.id]);

    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден." });
    }

    if (user.role === "admin") {
      return res.status(400).json({ error: "Нельзя изменить статус администратора." });
    }

    if (req.body.isBlocked === undefined) {
      return res.status(400).json({ error: "Нет данных для обновления." });
    }

    await db.run("UPDATE users SET is_blocked = ? WHERE id = ?", [
      req.body.isBlocked ? 1 : 0,
      req.params.id,
    ]);

    if (req.body.isBlocked) {
      await revokeAllUserSessions(req.params.id);
    }

    res.json({ message: req.body.isBlocked ? "Пользователь заблокирован." : "Пользователь разблокирован." });
  } catch (err) {
    next(err);
  }
});

router.delete("/users/:id", requireAdmin, async function (req, res, next) {
  try {
    const user = await db.get("SELECT id, role FROM users WHERE id = ?", [req.params.id]);

    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден." });
    }

    if (user.role === "admin") {
      return res.status(400).json({ error: "Нельзя удалить администратора." });
    }

    const deleted = await deleteUserCompletely(user.id);
    if (!deleted) {
      return res.status(404).json({ error: "Пользователь не найден." });
    }

    res.json({ message: "Пользователь полностью удалён из базы данных." });
  } catch (err) {
    next(err);
  }
});

router.get("/users/:id/bookings", requireAdmin, async function (req, res, next) {
  try {
    const user = await db.get(
      "SELECT id, email, phone FROM users WHERE id = ?",
      [req.params.id]
    );

    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден." });
    }

    const rows = await db.all(
      `SELECT
        id,
        guest_name AS guestName,
        phone,
        email,
        room_slug AS roomSlug,
        room_name AS roomName,
        check_in AS checkIn,
        check_out AS checkOut,
        guests,
        total_price AS totalPrice,
        status,
        created_at AS createdAt
      FROM bookings
      WHERE user_id = ?
         OR (user_id IS NULL AND email IS NOT NULL AND lower(email) = lower(?))
         OR (user_id IS NULL AND phone IS NOT NULL AND phone = ?)
      ORDER BY id DESC`,
      [user.id, user.email, user.phone || ""]
    );

    res.json({ bookings: rows });
  } catch (err) {
    next(err);
  }
});

router.get("/inquiries", requireAdmin, async function (req, res, next) {
  try {
    const status = String(req.query.status || "").trim();
    let sql = `SELECT
      id,
      name,
      phone,
      email,
      topic,
      message,
      status,
      created_at AS createdAt
    FROM inquiries`;
    const params = [];

    if (status) {
      sql += " WHERE status = ?";
      params.push(status);
    }

    sql += " ORDER BY id DESC";
    const rows = await db.all(sql, params);
    res.json({ inquiries: rows });
  } catch (err) {
    next(err);
  }
});

router.patch("/inquiries/:id", requireAdmin, async function (req, res, next) {
  try {
    const allowed = ["new", "in_progress", "processed"];
    const status = String(req.body.status || "").trim();

    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Недопустимый статус заявки." });
    }

    const result = await db.run("UPDATE inquiries SET status = ? WHERE id = ?", [
      status,
      req.params.id,
    ]);

    if (!result.changes) {
      return res.status(404).json({ error: "Заявка не найдена." });
    }

    res.json({ message: "Статус заявки обновлён." });
  } catch (err) {
    next(err);
  }
});

router.delete("/inquiries/:id", requireAdmin, async function (req, res, next) {
  try {
    const result = await db.run("DELETE FROM inquiries WHERE id = ?", [req.params.id]);

    if (!result.changes) {
      return res.status(404).json({ error: "Заявка не найдена." });
    }

    res.json({ message: "Заявка удалена." });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
