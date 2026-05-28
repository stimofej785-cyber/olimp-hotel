const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const { seedDatabase } = require("./seed");

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, "olymp.db");

let db;

function run(sql, params = []) {
  return new Promise(function (resolve, reject) {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise(function (resolve, reject) {
    db.get(sql, params, function (err, row) {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise(function (resolve, reject) {
    db.all(sql, params, function (err, rows) {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function exec(sql) {
  return new Promise(function (resolve, reject) {
    db.exec(sql, function (err) {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function migrateDatabase() {
  const userColumns = await all("PRAGMA table_info(users)");
  if (userColumns.length && !userColumns.some(function (col) { return col.name === "is_blocked"; })) {
    await run("ALTER TABLE users ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0");
  }
  if (userColumns.length && !userColumns.some(function (col) { return col.name === "last_login_at"; })) {
    await run("ALTER TABLE users ADD COLUMN last_login_at TEXT");
  }

  const roomColumns = await all("PRAGMA table_info(rooms)");
  if (roomColumns.length && !roomColumns.some(function (col) { return col.name === "total_units"; })) {
    await run("ALTER TABLE rooms ADD COLUMN total_units INTEGER NOT NULL DEFAULT 1");
  }

  const serviceBookingColumns = await all("PRAGMA table_info(service_bookings)");
  if (serviceBookingColumns.length) {
    if (!serviceBookingColumns.some(function (col) { return col.name === "hours"; })) {
      await run("ALTER TABLE service_bookings ADD COLUMN hours INTEGER NOT NULL DEFAULT 1");
    }
    if (!serviceBookingColumns.some(function (col) { return col.name === "guests"; })) {
      await run("ALTER TABLE service_bookings ADD COLUMN guests INTEGER NOT NULL DEFAULT 1");
    }
    if (!serviceBookingColumns.some(function (col) { return col.name === "total_price"; })) {
      await run("ALTER TABLE service_bookings ADD COLUMN total_price INTEGER NOT NULL DEFAULT 0");
    }
    if (!serviceBookingColumns.some(function (col) { return col.name === "user_id"; })) {
      await run("ALTER TABLE service_bookings ADD COLUMN user_id INTEGER REFERENCES users(id)");
    }
  }

  const bookingColumns = await all("PRAGMA table_info(bookings)");
  if (bookingColumns.length && !bookingColumns.some(function (col) { return col.name === "user_id"; })) {
    await run("ALTER TABLE bookings ADD COLUMN user_id INTEGER REFERENCES users(id)");
  }

  if (userColumns.length && !userColumns.some(function (col) { return col.name === "notification_prefs"; })) {
    await run("ALTER TABLE users ADD COLUMN notification_prefs TEXT");
  }
  if (userColumns.length && !userColumns.some(function (col) { return col.name === "vk_id"; })) {
    await run("ALTER TABLE users ADD COLUMN vk_id TEXT");
  }
  if (userColumns.length && !userColumns.some(function (col) { return col.name === "max_id"; })) {
    await run("ALTER TABLE users ADD COLUMN max_id TEXT");
  }

  await exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_vk_id ON users(vk_id) WHERE vk_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_max_id ON users(max_id) WHERE max_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      code_verifier TEXT NOT NULL,
      device_id TEXT,
      redirect_next TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS oauth_login_codes (
      code_hash TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS max_login_sessions (
      session_id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_service_booking_slot
    ON service_bookings(service_slug, booking_date)
    WHERE status != 'cancelled';
  `);

  await exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_password_reset_user
    ON password_reset_tokens(user_id);
  `);
}

async function withTransaction(callback) {
  await run("BEGIN IMMEDIATE");
  try {
    const result = await callback();
    await run("COMMIT");
    return result;
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  }
}

async function initDatabase() {
  return new Promise(function (resolve, reject) {
    db = new sqlite3.Database(DB_PATH, async function (err) {
      if (err) return reject(err);

      try {
        await exec(`
          CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guest_name TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT,
            room_slug TEXT NOT NULL,
            room_name TEXT NOT NULL,
            tariff TEXT NOT NULL DEFAULT 'basic',
            check_in TEXT NOT NULL,
            check_out TEXT NOT NULL,
            guests INTEGER NOT NULL,
            nights INTEGER NOT NULL,
            price_per_night INTEGER NOT NULL,
            total_price INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author_name TEXT NOT NULL,
            room_type TEXT,
            rating INTEGER NOT NULL,
            message TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS services (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'extra',
            description TEXT,
            price_text TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            phone TEXT,
            role TEXT NOT NULL DEFAULT 'user',
            is_blocked INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS rooms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'standard',
            price_per_night INTEGER NOT NULL,
            price_half_board INTEGER,
            price_full_board INTEGER,
            max_guests INTEGER NOT NULL DEFAULT 1,
            description TEXT,
            image_url TEXT,
            is_visible INTEGER NOT NULL DEFAULT 1,
            is_available INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS inquiries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT,
            email TEXT,
            topic TEXT,
            message TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'new',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS service_bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service_slug TEXT NOT NULL,
            service_name TEXT NOT NULL,
            guest_name TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT,
            booking_date TEXT NOT NULL,
            hours INTEGER NOT NULL DEFAULT 1,
            guests INTEGER NOT NULL DEFAULT 1,
            total_price INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          );
        `);

        await migrateDatabase();
        await seedDatabase({ run, get, all });
        resolve();
      } catch (initErr) {
        reject(initErr);
      }
    });
  });
}

module.exports = {
  DB_PATH,
  initDatabase,
  run,
  get,
  all,
  withTransaction,
};
