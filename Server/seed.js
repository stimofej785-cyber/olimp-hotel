const { hashPassword } = require("./utils/password");

const { DEFAULT_ADMIN_EMAIL, DEFAULT_DEMO_EMAIL } = require("./utils/loginIdentity");

const LEGACY_ADMIN_EMAILS = ["forestsorokin338@mail.ru"];
const LEGACY_DEMO_EMAILS = ["greter12@mail.ru"];

const PRIMARY_ADMIN = {
  email: (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase(),
  password: process.env.ADMIN_PASSWORD || "admin",
  firstName: process.env.ADMIN_FIRST_NAME || "Администратор",
  lastName: process.env.ADMIN_LAST_NAME || "Олимп",
  phone: process.env.ADMIN_PHONE || "+7 (000) 000 00 - 00",
  role: "admin",
};

/** Гость для демонстрации на предзащите (логин на login.html) */
const DEMO_GUEST = {
  email: (process.env.DEMO_USER_EMAIL || DEFAULT_DEMO_EMAIL).trim().toLowerCase(),
  password: process.env.DEMO_USER_PASSWORD || "user",
  firstName: "Пётр",
  lastName: "Зарубин",
  phone: process.env.DEMO_USER_PHONE || "+7 (915) 000-00-12",
  role: "user",
};

const DEFAULT_NOTIFICATION_PREFS = JSON.stringify({
  email: false,
  sms: false,
  promo: false,
  checkin: false,
});
const DEFAULT_ROOMS = [
  {
    slug: "single-standard",
    title: "Одноместный стандарт 1 категории",
    category: "standard",
    pricePerNight: 2400,
    priceHalfBoard: 2850,
    priceFullBoard: 3300,
    maxGuests: 1,
    description: "Однокомнатный номер, односпальная кровать, санузел с душем.",
    imageUrl: "assets/images/rooms/room-standard-single 1.svg",
    sortOrder: 1,
  },
  {
    slug: "improved-single",
    title: "Улучшенный одноместный стандарт 1 категории",
    category: "improved",
    pricePerNight: 3400,
    priceHalfBoard: 3850,
    priceFullBoard: 4300,
    maxGuests: 1,
    description: "Однокомнатный номер, двуспальная кровать, санузел с душем.",
    imageUrl: "assets/images/rooms/room-improved-single 1.svg",
    sortOrder: 2,
  },
  {
    slug: "improved-double",
    title: "Двухместный улучшенный стандарт",
    category: "improved",
    pricePerNight: 3600,
    priceHalfBoard: 4500,
    priceFullBoard: 5400,
    maxGuests: 2,
    description: "Однокомнатный номер, две односпальные кровати, санузел с душем.",
    imageUrl: "assets/images/rooms/room-double-improved 1.svg",
    sortOrder: 3,
  },
  {
    slug: "lux-single",
    title: "Люкс одноместный",
    category: "lux",
    pricePerNight: 5000,
    priceHalfBoard: 5450,
    priceFullBoard: 5900,
    maxGuests: 1,
    description: "Просторный номер повышенной комфортности с отдельной зоной отдыха.",
    imageUrl: "assets/images/rooms/room-luxe-single 1.svg",
    sortOrder: 4,
  },
];

const ROOM_UNITS = {
  "single-standard": 5,
  "improved-single": 7,
  "improved-double": 2,
  "lux-single": 1,
};

const DEFAULT_SERVICES = [
  {
    slug: "conference-hall",
    title: "Конференц-зал",
    category: "extra",
    description: "Идеальное пространство для деловых мероприятий. Вместимость до 40 человек.",
    priceText: "720 р/час",
    pricePerHour: 720,
    sortOrder: 1,
  },
  {
    slug: "sauna-pool",
    title: "Сауна с бассейном",
    category: "extra",
    description: "Финская парная, бассейн с подсветкой и гостевая комната.",
    priceText: "1800 руб / 1–2 час, 1200 руб / 3-й час",
    pricePerHour: 1800,
    priceExtraHour: 1200,
    sortOrder: 2,
  },
];

const DEFAULT_REVIEWS = [
  {
    authorName: "Ольга Смирнова",
    roomType: "Двухместный улучшенный",
    rating: 5,
    message:
      "Останавливаясь в гостинице «Олимп», я остался очень доволен своим выбором. Номер чистый, персонал внимательный.",
    status: "approved",
  },
  {
    authorName: "Мария Кузнецова",
    roomType: "Одноместный улучшенный",
    rating: 5,
    message:
      "Атмосфера очень уютная, номер комфортный. Персонал доброжелательный, обязательно вернёмся снова.",
    status: "approved",
  },
];

async function seedDatabase(db) {
  await ensurePrimaryAdmin(db);

  const roomsCount = await db.get("SELECT COUNT(*) AS count FROM rooms");
  if (!roomsCount || roomsCount.count === 0) {
    for (const room of DEFAULT_ROOMS) {
      await db.run(
        `INSERT INTO rooms (
          slug, title, category, price_per_night, price_half_board, price_full_board,
          max_guests, description, image_url, is_visible, is_available, sort_order, total_units
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
        [
          room.slug,
          room.title,
          room.category,
          room.pricePerNight,
          room.priceHalfBoard,
          room.priceFullBoard,
          room.maxGuests,
          room.description,
          room.imageUrl,
          room.sortOrder,
          ROOM_UNITS[room.slug] || 1,
        ]
      );
    }
  }

  for (const slug of Object.keys(ROOM_UNITS)) {
    await db.run(
      "UPDATE rooms SET total_units = ?, is_visible = 1, is_available = 1 WHERE slug = ?",
      [ROOM_UNITS[slug], slug]
    );
  }

  const servicesCount = await db.get("SELECT COUNT(*) AS count FROM services");
  if (!servicesCount || servicesCount.count === 0) {
    for (const service of DEFAULT_SERVICES) {
      await db.run(
        `INSERT INTO services (slug, title, category, description, price_text, price_per_hour, price_extra_hour, is_active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          service.slug,
          service.title,
          service.category,
          service.description,
          service.priceText,
          service.pricePerHour != null ? service.pricePerHour : null,
          service.priceExtraHour != null ? service.priceExtraHour : null,
          service.sortOrder,
        ]
      );
    }
  }

  for (const service of DEFAULT_SERVICES) {
    const existing = await db.get("SELECT id FROM services WHERE slug = ?", [service.slug]);
    if (!existing) {
      await db.run(
        `INSERT INTO services (slug, title, category, description, price_text, price_per_hour, price_extra_hour, is_active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          service.slug,
          service.title,
          service.category,
          service.description,
          service.priceText,
          service.pricePerHour != null ? service.pricePerHour : null,
          service.priceExtraHour != null ? service.priceExtraHour : null,
          service.sortOrder,
        ]
      );
    } else {
      await db.run(
        `UPDATE services
         SET category = ?,
             price_per_hour = COALESCE(price_per_hour, ?),
             price_extra_hour = COALESCE(price_extra_hour, ?)
         WHERE slug = ?`,
        [
          service.category,
          service.pricePerHour != null ? service.pricePerHour : null,
          service.priceExtraHour != null ? service.priceExtraHour : null,
          service.slug,
        ]
      );
    }
  }

  const reviewsCount = await db.get("SELECT COUNT(*) AS count FROM reviews");
  if (!reviewsCount || reviewsCount.count === 0) {
    for (const review of DEFAULT_REVIEWS) {
      await db.run(
        `INSERT INTO reviews (author_name, room_type, rating, message, status)
         VALUES (?, ?, ?, ?, ?)`,
        [review.authorName, review.roomType, review.rating, review.message, review.status]
      );
    }
  }

  await ensureDemoGuest(db);
}

async function migrateLegacyAccountEmail(db, legacyEmails, targetEmail) {
  if (!targetEmail) return;

  for (let i = 0; i < legacyEmails.length; i += 1) {
    const legacyEmail = String(legacyEmails[i] || "").trim().toLowerCase();
    if (!legacyEmail || legacyEmail === targetEmail) continue;

    const legacyUser = await db.get("SELECT id FROM users WHERE email = ?", [legacyEmail]);
    if (!legacyUser) continue;

    const targetUser = await db.get("SELECT id FROM users WHERE email = ?", [targetEmail]);
    if (targetUser && targetUser.id !== legacyUser.id) {
      await db.run("DELETE FROM users WHERE id = ?", [legacyUser.id]);
      return;
    }

    await db.run("UPDATE users SET email = ? WHERE id = ?", [targetEmail, legacyUser.id]);
    return;
  }
}

async function ensurePrimaryAdmin(db) {
  if (!PRIMARY_ADMIN.password) {
    console.warn("[seed] ADMIN_PASSWORD не задан — учётная запись администратора не обновлена.");
    return;
  }

  await migrateLegacyAccountEmail(db, LEGACY_ADMIN_EMAILS, PRIMARY_ADMIN.email);

  const hash = await hashPassword(PRIMARY_ADMIN.password);
  const existing = await db.get("SELECT id, role FROM users WHERE email = ?", [
    PRIMARY_ADMIN.email,
  ]);

  if (existing) {
    await db.run(
      `UPDATE users
       SET password = ?, first_name = ?, last_name = ?, phone = ?, role = ?, is_blocked = 0
       WHERE email = ?`,
      [
        hash,
        PRIMARY_ADMIN.firstName,
        PRIMARY_ADMIN.lastName,
        PRIMARY_ADMIN.phone,
        PRIMARY_ADMIN.role,
        PRIMARY_ADMIN.email,
      ]
    );
  } else {
    await db.run(
      `INSERT INTO users (email, password, first_name, last_name, phone, role, is_blocked, notification_prefs)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        PRIMARY_ADMIN.email,
        hash,
        PRIMARY_ADMIN.firstName,
        PRIMARY_ADMIN.lastName,
        PRIMARY_ADMIN.phone,
        PRIMARY_ADMIN.role,
        DEFAULT_NOTIFICATION_PREFS,
      ]
    );
  }

  console.log(
    "[seed] Администратор:",
    PRIMARY_ADMIN.email,
    "—",
    PRIMARY_ADMIN.firstName,
    PRIMARY_ADMIN.lastName
  );
}

async function ensureDemoGuest(db) {
  await migrateLegacyAccountEmail(db, LEGACY_DEMO_EMAILS, DEMO_GUEST.email);

  const hash = await hashPassword(DEMO_GUEST.password);
  const existing = await db.get("SELECT id FROM users WHERE email = ?", [DEMO_GUEST.email]);

  if (existing) {
    await db.run(
      `UPDATE users
       SET password = ?, first_name = ?, last_name = ?, phone = ?, role = ?, is_blocked = 0
       WHERE email = ?`,
      [
        hash,
        DEMO_GUEST.firstName,
        DEMO_GUEST.lastName,
        DEMO_GUEST.phone,
        DEMO_GUEST.role,
        DEMO_GUEST.email,
      ]
    );
  } else {
    await db.run(
      `INSERT INTO users (
         email, password, first_name, last_name, phone, role, is_blocked,
         notification_prefs, last_login_at
       ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, datetime('now'))`,
      [
        DEMO_GUEST.email,
        hash,
        DEMO_GUEST.firstName,
        DEMO_GUEST.lastName,
        DEMO_GUEST.phone,
        DEMO_GUEST.role,
        DEFAULT_NOTIFICATION_PREFS,
      ]
    );
  }

  console.log("[seed] Демо-гость:", DEMO_GUEST.email, "—", DEMO_GUEST.firstName, DEMO_GUEST.lastName);
}

module.exports = { seedDatabase, PRIMARY_ADMIN, DEMO_GUEST };
