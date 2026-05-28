const { hashPassword } = require("./utils/password");

const DEFAULT_ADMIN = {
  email: process.env.ADMIN_EMAIL || "admin@olimp.local",
  firstName: "Администратор",
  lastName: "Олимп",
  phone: "+7 (000) 000 00 - 00",
  role: "admin",
};
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
    category: "main",
    description: "Идеальное пространство для деловых мероприятий. Вместимость до 40 человек.",
    priceText: "720 р/час",
    sortOrder: 1,
  },
  {
    slug: "sauna-pool",
    title: "Сауна с бассейном",
    category: "main",
    description: "Финская парная, бассейн с подсветкой и гостевая комната.",
    priceText: "1800 руб / 1–2 час",
    sortOrder: 2,
  },
  {
    slug: "taxi",
    title: "Заказ такси",
    category: "extra",
    description: "Организуем трансфер до аэропорта и вокзала.",
    priceText: "по запросу",
    sortOrder: 3,
  },
  {
    slug: "wifi",
    title: "Интернет Wi-Fi",
    category: "extra",
    description: "Высокоскоростной Wi-Fi на всей территории гостиницы.",
    priceText: "бесплатно",
    sortOrder: 4,
  },
  {
    slug: "sport-rent",
    title: "Прокат спортивного инвентаря",
    category: "extra",
    description: "Лыжи, роликовые лыжи, теннисный инвентарь и др.",
    priceText: "по прайсу",
    sortOrder: 5,
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
  const existingAdmin = await db.get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");

  if (!existingAdmin) {
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      console.warn(
        "[seed] Администратор не создан. Задайте ADMIN_PASSWORD (и при необходимости ADMIN_EMAIL) перед первым запуском."
      );
    } else {
      const adminHash = await hashPassword(adminPassword);
      await db.run(
        `INSERT INTO users (email, password, first_name, last_name, phone, role, is_blocked)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [
          DEFAULT_ADMIN.email,
          adminHash,
          DEFAULT_ADMIN.firstName,
          DEFAULT_ADMIN.lastName,
          DEFAULT_ADMIN.phone,
          DEFAULT_ADMIN.role,
        ]
      );
    }
  }
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
    await db.run("UPDATE rooms SET total_units = ? WHERE slug = ?", [ROOM_UNITS[slug], slug]);
  }

  const servicesCount = await db.get("SELECT COUNT(*) AS count FROM services");
  if (!servicesCount || servicesCount.count === 0) {
    for (const service of DEFAULT_SERVICES) {
      await db.run(
        `INSERT INTO services (slug, title, category, description, price_text, is_active, sort_order)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
        [
          service.slug,
          service.title,
          service.category,
          service.description,
          service.priceText,
          service.sortOrder,
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
}

module.exports = { seedDatabase };
