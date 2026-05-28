const express = require("express");
const db = require("../db");

const router = express.Router();

const { validateEmail, validateTextLength } = require("../constants");
router.get("/", async function (req, res, next) {
  try {
    const rows = await db.all(
      `SELECT
        id,
        author_name AS authorName,
        room_type AS roomType,
        rating,
        message,
        created_at AS createdAt
      FROM reviews
      WHERE status = 'approved'
      ORDER BY id DESC`
    );

    res.json({ reviews: rows });
  } catch (err) {
    next(err);
  }
});

router.post("/", async function (req, res, next) {
  try {
    const authorName = String(req.body.authorName || req.body.name || "").trim();
    const roomType = String(req.body.roomType || req.body.room || "").trim();
    const message = String(req.body.message || "").trim();
    const rating = Number(req.body.rating);

    if (!authorName || !message) {
      return res.status(400).json({ error: "Укажите имя и текст отзыва." });
    }

    const messageError = validateTextLength(message, "Текст отзыва", true);
    if (messageError) {
      return res.status(400).json({ error: messageError });
    }

    const nameError = validateTextLength(authorName, "Имя", true);
    if (nameError) {
      return res.status(400).json({ error: nameError });
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Оценка должна быть от 1 до 5." });
    }

    const result = await db.run(
      `INSERT INTO reviews (author_name, room_type, rating, message, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [authorName, roomType || null, rating, message]
    );

    res.status(201).json({
      message: "Отзыв отправлен на модерацию.",
      review: { id: result.id, status: "pending" },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
