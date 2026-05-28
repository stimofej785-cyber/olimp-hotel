const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { hashPassword, verifyPassword, isLegacyHash } = require("../utils/password");
const {
  validateEmail,
  validatePassword,
  validatePersonName,
  validatePhone,
} = require("../constants");
const {
  createSession,
  revokeSession,
  revokeAllUserSessions,
  requireAuth,
} = require("../middleware/adminAuth");

const router = express.Router();

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const FORGOT_PASSWORD_MESSAGE =
  "Если указанный email зарегистрирован, на почту отправлены инструкции по восстановлению пароля.";

const DEFAULT_NOTIFICATIONS = {
  email: false,
  sms: false,
  promo: false,
  checkin: false,
};

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function mapUser(row) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone || "",
    role: row.role,
    notifications: parseNotificationPrefs(row.notification_prefs),
  };
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function buildResetLink(req, token) {
  const proto = req.get("x-forwarded-proto") || req.protocol || "http";
  const host = req.get("x-forwarded-host") || req.get("host") || "localhost:3000";
  return proto + "://" + host + "/reset-password.html?token=" + encodeURIComponent(token);
}

function shouldExposeResetLink() {
  return process.env.PASSWORD_RESET_EXPOSE_LINK !== "0";
}

async function createPasswordResetToken(userId) {
  await db.run(
    "DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL",
    [userId]
  );

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

  await db.run(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES (?, ?, ?)`,
    [userId, hashResetToken(token), expiresAt]
  );

  return token;
}

async function findValidResetTokenRow(token) {
  const tokenHash = hashResetToken(token);
  const row = await db.get(
    `SELECT id, user_id, expires_at, used_at
     FROM password_reset_tokens
     WHERE token_hash = ?`,
    [tokenHash]
  );

  if (!row || row.used_at) {
    return null;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return null;
  }

  return row;
}

function parseNotificationPrefs(raw) {
  if (!raw) return Object.assign({}, DEFAULT_NOTIFICATIONS);

  try {
    const parsed = JSON.parse(raw);
    return {
      email: Boolean(parsed.email),
      sms: Boolean(parsed.sms),
      promo: Boolean(parsed.promo),
      checkin: Boolean(parsed.checkin),
    };
  } catch (error) {
    return Object.assign({}, DEFAULT_NOTIFICATIONS);
  }
}

router.post("/login", async function (req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Укажите email и пароль." });
    }

    const emailError = validateEmail(email);
    if (emailError) {
      return res.status(400).json({ error: emailError });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const user = await db.get(
      `SELECT id, email, password, first_name, last_name, phone, role, is_blocked
       FROM users WHERE email = ?`,
      [email]
    );

    if (!user || !(await verifyPassword(password, user.password))) {
      return res.status(401).json({ error: "Неверный email или пароль." });
    }

    if (user.is_blocked) {
      return res.status(403).json({ error: "Аккаунт заблокирован. Обратитесь к администратору." });
    }

    if (isLegacyHash(user.password)) {
      await db.run("UPDATE users SET password = ? WHERE id = ?", [
        await hashPassword(password),
        user.id,
      ]);
    }

    await db.run(
      "UPDATE users SET last_login_at = datetime('now') WHERE id = ?",
      [user.id]
    );

    const publicUser = mapUser(user);
    const token = await createSession(publicUser);

    res.json({
      message: "Вход выполнен.",
      token,
      user: publicUser,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/register", async function (req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const firstName = String(req.body.firstName || req.body["first-name"] || "").trim();
    const lastName = String(req.body.lastName || req.body["last-name"] || "").trim();
    const phone = String(req.body.phone || "").trim();

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: "Заполните все обязательные поля." });
    }

    const emailError = validateEmail(email);
    if (emailError) {
      return res.status(400).json({ error: emailError });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const firstNameError = validatePersonName(firstName, true);
    if (firstNameError) {
      return res.status(400).json({ error: firstNameError });
    }

    const lastNameError = validatePersonName(lastName, true);
    if (lastNameError) {
      return res.status(400).json({ error: lastNameError });
    }

    const phoneError = validatePhone(phone, false);
    if (phoneError) {
      return res.status(400).json({ error: phoneError });
    }

    const existing = await db.get("SELECT id FROM users WHERE email = ?", [email]);
    if (existing) {
      return res.status(400).json({ error: "Пользователь с таким email уже зарегистрирован." });
    }

    const result = await db.run(
      `INSERT INTO users (email, password, first_name, last_name, phone, role, last_login_at, notification_prefs)
       VALUES (?, ?, ?, ?, ?, 'user', datetime('now'), ?)`,
      [email, await hashPassword(password), firstName, lastName, phone, JSON.stringify(DEFAULT_NOTIFICATIONS)]
    );

    const user = {
      id: result.id,
      email,
      firstName,
      lastName,
      phone,
      role: "user",
      notifications: Object.assign({}, DEFAULT_NOTIFICATIONS),
    };

    const token = await createSession(user);

    res.status(201).json({
      message: "Регистрация успешна.",
      token,
      user,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/forgot-password", async function (req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email) {
      return res.status(400).json({ error: "Укажите email." });
    }

    const emailError = validateEmail(email);
    if (emailError) {
      return res.status(400).json({ error: emailError });
    }

    const user = await db.get(
      `SELECT id, email, role, is_blocked
       FROM users WHERE email = ?`,
      [email]
    );

    const response = { message: FORGOT_PASSWORD_MESSAGE };

    if (user && !user.is_blocked && user.role !== "admin") {
      const token = await createPasswordResetToken(user.id);
      const resetLink = buildResetLink(req, token);

      if (shouldExposeResetLink()) {
        response.resetLink = resetLink;
      } else {
        console.log("[password-reset] Ссылка для " + email + ": " + resetLink);
      }
    }

    res.json(response);
  } catch (err) {
    next(err);
  }
});

router.get("/reset-password", async function (req, res, next) {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) {
      return res.json({ valid: false });
    }

    const row = await findValidResetTokenRow(token);
    res.json({ valid: Boolean(row) });
  } catch (err) {
    next(err);
  }
});

router.post("/reset-password", async function (req, res, next) {
  try {
    const token = String(req.body.token || "").trim();
    const password = String(req.body.password || "");
    const passwordConfirm = String(req.body.passwordConfirm || req.body.password_confirm || "");

    if (!token) {
      return res.status(400).json({ error: "Ссылка для сброса пароля недействительна." });
    }

    if (!password || !passwordConfirm) {
      return res.status(400).json({ error: "Укажите новый пароль и подтверждение." });
    }

    if (password !== passwordConfirm) {
      return res.status(400).json({ error: "Пароли не совпадают." });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const row = await findValidResetTokenRow(token);
    if (!row) {
      return res.status(400).json({
        error: "Ссылка устарела или уже использована. Запросите восстановление пароля снова.",
      });
    }

    const user = await db.get(
      "SELECT id, role, is_blocked FROM users WHERE id = ?",
      [row.user_id]
    );

    if (!user || user.is_blocked || user.role === "admin") {
      return res.status(400).json({ error: "Сброс пароля для этого аккаунта недоступен." });
    }

    await db.run("UPDATE users SET password = ? WHERE id = ?", [
      await hashPassword(password),
      user.id,
    ]);
    await db.run(
      "UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?",
      [row.id]
    );
    await revokeAllUserSessions(user.id);

    res.json({
      message: "Пароль обновлён. Теперь вы можете войти с новым паролем.",
    });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", requireAuth, async function (req, res, next) {
  try {
    await revokeSession(req.authToken);
    res.json({ message: "Выход выполнен." });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, async function (req, res, next) {
  try {
    const row = await db.get(
      `SELECT id, email, first_name, last_name, phone, role, notification_prefs
       FROM users WHERE id = ?`,
      [req.authUser.id]
    );

    if (!row) {
      return res.status(401).json({ error: "Пользователь не найден." });
    }

    res.json({ user: mapUser(row) });
  } catch (err) {
    next(err);
  }
});

router.patch("/profile", requireAuth, async function (req, res, next) {
  try {
    const userId = req.authUser.id || req.authUser.userId;
    const firstName = String(req.body.firstName || "").trim();
    const lastName = String(req.body.lastName || "").trim();
    const phone = String(req.body.phone || "").trim();
    const password = String(req.body.password || "");
    const notifications = req.body.notifications;

    if (!firstName || !lastName) {
      return res.status(400).json({ error: "Укажите имя и фамилию." });
    }

    const firstNameError = validatePersonName(firstName, true);
    if (firstNameError) {
      return res.status(400).json({ error: firstNameError });
    }

    const lastNameError = validatePersonName(lastName, true);
    if (lastNameError) {
      return res.status(400).json({ error: lastNameError });
    }

    const phoneError = validatePhone(phone, false);
    if (phoneError) {
      return res.status(400).json({ error: phoneError });
    }

    if (password) {
      const passwordError = validatePassword(password);
      if (passwordError) {
        return res.status(400).json({ error: passwordError });
      }
    }

    const updates = ["first_name = ?", "last_name = ?", "phone = ?"];
    const params = [firstName, lastName, phone];

    if (notifications && typeof notifications === "object") {
      updates.push("notification_prefs = ?");
      params.push(
        JSON.stringify({
          email: Boolean(notifications.email),
          sms: Boolean(notifications.sms),
          promo: Boolean(notifications.promo),
          checkin: Boolean(notifications.checkin),
        })
      );
    }

    if (password) {
      updates.push("password = ?");
      params.push(await hashPassword(password));
    }

    params.push(userId);
    await db.run("UPDATE users SET " + updates.join(", ") + " WHERE id = ?", params);

    if (password) {
      await revokeAllUserSessions(userId, req.authToken);
    }

    const row = await db.get(
      `SELECT id, email, first_name, last_name, phone, role, notification_prefs
       FROM users WHERE id = ?`,
      [userId]
    );

    res.json({
      message: password
        ? "Данные обновлены. Другие активные сессии завершены."
        : "Данные аккаунта обновлены.",
      user: mapUser(row),
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/account", requireAuth, async function (req, res, next) {
  try {
    const userId = req.authUser.id || req.authUser.userId;
    const password = String(req.body.password || "");

    if (!password) {
      return res.status(400).json({ error: "Укажите пароль для подтверждения удаления." });
    }

    const user = await db.get(
      "SELECT id, password, role FROM users WHERE id = ?",
      [userId]
    );

    if (!user) {
      return res.status(401).json({ error: "Пользователь не найден." });
    }

    if (user.role === "admin") {
      return res.status(403).json({ error: "Аккаунт администратора нельзя удалить через сайт." });
    }

    if (!(await verifyPassword(password, user.password))) {
      return res.status(401).json({ error: "Неверный пароль." });
    }

    await db.run("DELETE FROM sessions WHERE user_id = ?", [userId]);
    await db.run("DELETE FROM users WHERE id = ?", [userId]);

    res.json({ message: "Аккаунт удалён." });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
