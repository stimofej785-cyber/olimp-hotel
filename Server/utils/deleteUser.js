const db = require("../db");

async function deleteUserCompletely(userId) {
  const user = await db.get("SELECT id, email FROM users WHERE id = ?", [userId]);
  if (!user) {
    return false;
  }

  const email = String(user.email || "").trim().toLowerCase();

  await db.withTransaction(async function () {
    await db.run("DELETE FROM sessions WHERE user_id = ?", [userId]);
    await db.run("DELETE FROM password_reset_tokens WHERE user_id = ?", [userId]);
    await db.run("DELETE FROM bookings WHERE user_id = ?", [userId]);
    await db.run("DELETE FROM service_bookings WHERE user_id = ?", [userId]);

    if (email) {
      await db.run(
        `DELETE FROM bookings
         WHERE user_id IS NULL AND email IS NOT NULL AND LOWER(TRIM(email)) = ?`,
        [email]
      );
      await db.run(
        `DELETE FROM service_bookings
         WHERE user_id IS NULL AND email IS NOT NULL AND LOWER(TRIM(email)) = ?`,
        [email]
      );
    }

    await db.run("DELETE FROM users WHERE id = ?", [userId]);
  });

  return true;
}

module.exports = {
  deleteUserCompletely,
};
