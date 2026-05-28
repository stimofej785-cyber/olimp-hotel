const db = require("./db");

const TARIFFS = ["basic", "half-board", "full-board"];

function mapRoom(row) {
  if (!row) return null;

  return {
    id: row.id,
    slug: row.slug,
    name: row.title,
    title: row.title,
    category: row.category,
    maxGuests: row.max_guests,
    pricePerNight: row.price_per_night,
    description: row.description || "",
    imageUrl: row.image_url || "",
    isVisible: Boolean(row.is_visible),
    isAvailable: Boolean(row.is_available),
    totalUnits: row.total_units || 1,
    sortOrder: row.sort_order,
    prices: {
      basic: row.price_per_night,
      "half-board": row.price_half_board || row.price_per_night,
      "full-board": row.price_full_board || row.price_per_night,
    },
  };
}

async function getRoom(slug, options) {
  const opts = options || {};
  let sql = "SELECT * FROM rooms WHERE slug = ?";
  const params = [slug];

  if (opts.visibleOnly) {
    sql += " AND is_visible = 1";
  }

  const row = await db.get(sql, params);
  return mapRoom(row);
}

async function listRooms(options) {
  const opts = options || {};
  let sql = "SELECT * FROM rooms";
  const conditions = [];
  const params = [];

  if (opts.visibleOnly) {
    conditions.push("is_visible = 1");
  }

  if (opts.availableOnly) {
    conditions.push("is_available = 1");
  }

  if (conditions.length) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY sort_order ASC, id ASC";
  const rows = await db.all(sql, params);
  return rows.map(mapRoom);
}

async function countBookedUnits(roomSlug, checkIn, checkOut) {
  const row = await db.get(
    `SELECT COUNT(*) AS count
     FROM bookings
     WHERE room_slug = ?
       AND status != 'cancelled'
       AND check_in < ?
       AND check_out > ?`,
    [roomSlug, checkOut, checkIn]
  );

  return row ? row.count : 0;
}

async function getAvailableUnits(roomSlug, checkIn, checkOut) {
  const row = await db.get(
    "SELECT total_units, is_available FROM rooms WHERE slug = ?",
    [roomSlug]
  );

  if (!row || !row.is_available) {
    return 0;
  }

  const booked = await countBookedUnits(roomSlug, checkIn, checkOut);
  return Math.max(0, (row.total_units || 1) - booked);
}

async function listRoomsWithAvailability(options) {
  const opts = options || {};
  const rooms = await listRooms(opts);
  const checkIn = String(opts.checkIn || "").trim();
  const checkOut = String(opts.checkOut || "").trim();

  if (!checkIn || !checkOut) {
    return rooms.map(function (room) {
      return Object.assign({}, room, {
        availableCount: room.totalUnits,
      });
    });
  }

  const enriched = [];
  for (let i = 0; i < rooms.length; i += 1) {
    const room = rooms[i];
    const availableCount = await getAvailableUnits(room.slug, checkIn, checkOut);
    enriched.push(Object.assign({}, room, { availableCount }));
  }

  return enriched;
}

module.exports = {
  TARIFFS,
  mapRoom,
  getRoom,
  listRooms,
  countBookedUnits,
  getAvailableUnits,
  listRoomsWithAvailability,
};
