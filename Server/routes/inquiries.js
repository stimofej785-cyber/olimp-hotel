const express = require("express");
const db = require("../db");

const router = express.Router();

const { validateEmail, validateTextLength, validatePersonName } = require("../constants");
router.post("/", async function (req, res, next) {
  try {
    const name = String(req.body.name || "").trim();
    const phone = String(req.body.phone || "").trim();
    const email = String(req.body.email || "").trim();
    const topic = String(req.body.topic || "").trim();
    const message = String(req.body.message || "").trim();

    if (!name || !message) {
      return res.status(400).json({ error: "Укажите имя и текст сообщения." });
    }

    const nameError = validatePersonName(name, true);
    if (nameError) {
      return res.status(400).json({ error: nameError });
    }

    const messageError = validateTextLength(message, "Сообщение", true);
    if (messageError) {
      return res.status(400).json({ error: messageError });
    }
    if (!phone && !email) {
      return res.status(400).json({ error: "Укажите телефон или email для связи." });
    }

    if (email) {
      const emailError = validateEmail(email);
      if (emailError) {
        return res.status(400).json({ error: emailError });
      }
    }

    const result = await db.run(
      `INSERT INTO inquiries (name, phone, email, topic, message, status)
       VALUES (?, ?, ?, ?, ?, 'new')`,
      [name, phone || null, email || null, topic || null, message]
    );

    res.status(201).json({
      message: "Заявка отправлена. Мы свяжемся с вами в ближайшее время.",
      id: result.id,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
