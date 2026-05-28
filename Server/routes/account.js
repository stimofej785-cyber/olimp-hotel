const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/adminAuth");

const router = express.Router();

router.get("/summary", requireAuth, async function (req, res, next) {
  try {
    const userId = req.authUser.id || req.authUser.userId;
    const email = String(req.authUser.email || "").trim().toLowerCase();

    if (email) {
      await db.run(
        `UPDATE bookings
         SET user_id = ?
         WHERE user_id IS NULL AND email IS NOT NULL AND LOWER(TRIM(email)) = ?`,
        [userId, email]
      );
      await db.run(
        `UPDATE service_bookings
         SET user_id = ?
         WHERE user_id IS NULL AND email IS NOT NULL AND LOWER(TRIM(email)) = ?`,
        [userId, email]
      );
    }

    const roomBookings = await db.all(
      `SELECT
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
      FROM bookings
      WHERE user_id = ?
      ORDER BY check_in DESC, id DESC`,
      [userId]
    );

    const serviceBookings = await db.all(
      `SELECT
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
        created_at AS createdAt
      FROM service_bookings
      WHERE user_id = ?
      ORDER BY booking_date DESC, id DESC`,
      [userId]
    );

    res.json({
      roomBookings: roomBookings,
      serviceBookings: serviceBookings,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
