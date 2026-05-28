const crypto = require("crypto");
const db = require("../db");

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function mapSessionUser(row) {
  if (!row) return null;

  return {
    id: row.user_id,
    userId: row.user_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone || "",
    role: row.role,
  };
}

async function createSession(user) {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await db.run(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`,
    [token, user.id, expiresAt]
  );

  return token;
}

async function getSession(token) {
  if (!token) return null;

  const row = await db.get(
    `SELECT
      s.token,
      s.user_id,
      s.expires_at,
      u.email,
      u.first_name,
      u.last_name,
      u.phone,
      u.role,
      u.is_blocked
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.token = ?`,
    [token]
  );

  if (!row) return null;

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await revokeSession(token);
    return null;
  }

  if (row.is_blocked) {
    await revokeSession(token);
    return null;
  }

  return mapSessionUser(row);
}

async function revokeSession(token) {
  if (!token) return;
  await db.run("DELETE FROM sessions WHERE token = ?", [token]);
}

async function revokeAllUserSessions(userId, exceptToken) {
  if (!userId) return;

  if (exceptToken) {
    await db.run("DELETE FROM sessions WHERE user_id = ? AND token != ?", [userId, exceptToken]);
    return;
  }

  await db.run("DELETE FROM sessions WHERE user_id = ?", [userId]);
}

function readAuthToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function requireAuth(req, res, next) {
  const token = readAuthToken(req);

  getSession(token)
    .then(function (session) {
      if (!session) {
        return res.status(401).json({ error: "Требуется авторизация." });
      }

      req.authToken = token;
      req.authUser = session;
      next();
    })
    .catch(next);
}

function requireAdmin(req, res, next) {
  const token = readAuthToken(req);

  getSession(token)
    .then(function (session) {
      if (!session) {
        return res.status(401).json({ error: "Требуется авторизация." });
      }

      if (session.role !== "admin") {
        return res.status(403).json({ error: "Доступ только для администратора." });
      }

      req.authToken = token;
      req.authUser = session;
      req.adminToken = token;
      next();
    })
    .catch(next);
}

module.exports = {
  createSession,
  getSession,
  revokeSession,
  revokeAllUserSessions,
  readAuthToken,
  requireAuth,
  requireAdmin,
};
