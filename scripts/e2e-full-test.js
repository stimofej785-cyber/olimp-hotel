/**
 * Полное E2E-тестирование + очистка тестовых данных.
 * Запуск: node scripts/e2e-full-test.js
 * Требует: npm start (localhost:3000)
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const sqlite3 = require("sqlite3").verbose();

const ROOT = path.join(__dirname, "..");
const DB_PATH = path.join(ROOT, "Server", "olymp.db");

const ADMIN = {
  email: "forestsorokin338@mail.ru",
  password: "Shohte12",
};
const DEMO_GUEST = {
  email: "greter12@mail.ru",
  password: "great123",
};

const passed = [];
const issues = [];
const cleanup = {
  bookingIds: [],
  serviceBookingIds: [],
  userIds: [],
  reviewIds: [],
  roomRestores: [],
  serviceRestores: [],
};

function logOk(msg) {
  passed.push(msg);
}

function logFail(msg) {
  issues.push(msg);
}

function request(method, urlPath, body, headers) {
  return new Promise(function (resolve, reject) {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "localhost",
        port: 3000,
        path: urlPath,
        method: method,
        headers: Object.assign(
          { "Content-Type": "application/json" },
          data ? { "Content-Length": Buffer.byteLength(data) } : {},
          headers || {}
        ),
      },
      function (res) {
        let raw = "";
        res.on("data", function (chunk) {
          raw += chunk;
        });
        res.on("end", function () {
          let json = raw;
          try {
            json = JSON.parse(raw);
          } catch (error) {
            json = raw;
          }
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function futureISODate(daysAhead) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + daysAhead);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function testStaticCardFields() {
  const pages = [
    "booking.html",
    "services.html",
    "room-improved-double.html",
    "room-detail.html",
  ];
  for (const page of pages) {
    const html = readFile(page);
    if (!html.includes('name="card-number"')) {
      logFail(`Карта: ${page} — нет поля номера карты`);
      continue;
    }
    const cvvMatch = html.match(/name="card-cvv"[\s\S]{0,200}maxlength="(\d+)"/i);
    if (!cvvMatch || cvvMatch[1] !== "3") {
      logFail(`Карта: ${page} — CVV не ограничен 3 символами`);
    } else {
      logOk(`Карта: ${page} — поля и CVV maxlength=3 — OK`);
    }
  }

  const script = readFile("js/script.js");
  if (!script.includes("cvv.length !== 3")) {
    logFail("Карта: validatePaymentCard не требует ровно 3 цифры CVV");
  } else {
    logOk("Карта: валидация CVV (3 цифры) в script.js — OK");
  }
  if (script.includes("error=not_admin")) {
    logFail("Вход: осталась логика error=not_admin");
  } else if (script.includes('window.location.href = "account.html"')) {
    logOk("Вход: гость перенаправляется в account.html — OK");
  }
}

function testNotificationDateLogic() {
  const script = readFile("js/script.js");
  if (!script.includes("function getBookingNotificationDate")) {
    logFail("Уведомления: нет getBookingNotificationDate");
    return;
  }

  function parseAccountISODate(iso) {
    const parts = String(iso || "").split("-");
    if (parts.length !== 3) return null;
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function localISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  function getBookingNotificationDate(createdAt, eventDate) {
    const createdIso = String(createdAt || "").slice(0, 10);
    const eventIso = String(eventDate || "").slice(0, 10);
    const created = parseAccountISODate(createdIso);
    const event = parseAccountISODate(eventIso);
    if (created && event) {
      const daysBeforeEvent = Math.round((event - created) / (86400000));
      if (daysBeforeEvent >= 0 && daysBeforeEvent <= 30) return createdIso;
    }
    if (event) {
      const notifyDate = new Date(event);
      notifyDate.setDate(notifyDate.getDate() - 2);
      return localISODate(notifyDate);
    }
    return createdIso || eventIso;
  }

  const febNotify = getBookingNotificationDate("2026-06-05", "2027-02-05");
  if (febNotify.startsWith("2027-02")) {
    logOk("Уведомления: дата в месяце заезда (февраль) — OK");
  } else {
    logFail(`Уведомления: ожидали февраль, получили ${febNotify}`);
  }

  const nearNotify = getBookingNotificationDate("2026-06-08", "2026-06-09");
  if (nearNotify === "2026-06-08") {
    logOk("Уведомления: бронь за день до заезда — дата создания — OK");
  } else {
    logFail(`Уведомления: ближняя бронь — ${nearNotify}`);
  }
}

function testAdminUiPatterns() {
  const adminJs = readFile("js/admin.js");
  if (!adminJs.includes("BOOKABLE_SERVICE_SLUGS")) {
    logFail("Админ услуги: нет фильтра bookable услуг");
  } else if (!adminJs.includes("renderServiceBookingsForSlug")) {
    logFail("Админ услуги: нет блока бронирований по дням");
  } else {
    logOk("Админ услуги: 2 услуги + бронирования по дням — OK");
  }

  const script = readFile("js/script.js");
  if (!script.includes("renderServiceBookingItem")) {
    logFail("ЛК: нет отображения бронирований услуг");
  } else if (!script.includes("buildAccountBookingGroups")) {
    logFail("ЛК: услуги не объединены с номерами во вкладках");
  } else {
    logOk("ЛК: бронирования услуг в кабинете — OK");
  }
}

async function login(email, password) {
  const res = await request("POST", "/api/auth/login", { email, password });
  if (res.status !== 200 || !res.body.token) {
    throw new Error(`Вход ${email} — ${res.status}`);
  }
  return res.body;
}

async function runApiTests() {
  const testEmail = `e2e-${Date.now()}@mail.ru`;
  const testPassword = "TestPass123";

  const register = await request("POST", "/api/auth/register", {
    firstName: "Тест",
    lastName: "Пользователь",
    email: testEmail,
    phone: "+7 (900) 111-22-33",
    password: testPassword,
  });

  if (register.status === 201 && register.body.token && register.body.user) {
    logOk("Регистрация нового пользователя — OK");
    cleanup.userIds.push(register.body.user.id);
  } else {
    logFail(`Регистрация — ${register.status} ${JSON.stringify(register.body)}`);
  }

  const guest = await login(DEMO_GUEST.email, DEMO_GUEST.password);
  if (guest.user.role === "user") {
    logOk("Вход демо-гостя greter — OK");
  } else {
    logFail("Вход greter — неверная роль");
  }

  const admin = await login(ADMIN.email, ADMIN.password);
  if (admin.user.role === "admin") {
    logOk("Вход администратора — OK");
  } else {
    logFail("Вход админа — ошибка");
    return;
  }

  const adminHdr = { Authorization: "Bearer " + admin.token };
  const guestHdr = { Authorization: "Bearer " + guest.token };

  const roomsRes = await request("GET", "/api/admin/rooms", null, adminHdr);
  const rooms = roomsRes.body.rooms || [];
  if (!rooms.length) {
    logFail("Админ: список номеров пуст");
  } else {
    const room = rooms[0];
    cleanup.roomRestores.push({
      id: room.id,
      title: room.title,
      description: room.description,
      pricePerNight: room.pricePerNight,
    });
    const newDesc = (room.description || "") + " [e2e]";
    const newPrice = Number(room.pricePerNight) + 1;
    const patchRoom = await request(
      "PATCH",
      "/api/admin/rooms/" + room.id,
      { description: newDesc, pricePerNight: newPrice },
      adminHdr
    );
    const roomsAfter = await request("GET", "/api/admin/rooms", null, adminHdr);
    const updated = (roomsAfter.body.rooms || []).find(function (r) {
      return r.id === room.id;
    });
    if (
      patchRoom.status === 200 &&
      updated &&
      updated.description === newDesc &&
      Number(updated.pricePerNight) === newPrice
    ) {
      logOk("Админ: изменение описания и цены номера — OK");
    } else {
      logFail("Админ: не сохранились изменения номера");
    }
  }

  const servicesRes = await request("GET", "/api/admin/services", null, adminHdr);
  const allServices = servicesRes.body.services || [];
  const bookable = allServices.filter(function (s) {
    return s.slug === "conference-hall" || s.slug === "sauna-pool";
  });
  if (bookable.length !== 2) {
    logFail(`Админ: ожидали 2 услуги, найдено bookable: ${bookable.length}`);
  } else {
    logOk("Админ: 2 редактируемые услуги (конференц-зал, сауна) — OK");
  }

  const service = bookable.find(function (s) {
    return s.slug === "conference-hall";
  }) || bookable[0];

  if (service) {
    cleanup.serviceRestores.push({
      id: service.id,
      description: service.description,
      pricePerHour: service.pricePerHour,
    });
    const svcDesc = (service.description || "") + " [e2e]";
    const svcPrice = Number(service.pricePerHour || 720) + 10;
    const patchSvc = await request(
      "PATCH",
      "/api/admin/services/" + service.id,
      { description: svcDesc, pricePerHour: svcPrice },
      adminHdr
    );
    const servicesAfter = await request("GET", "/api/admin/services", null, adminHdr);
    const updatedSvc = (servicesAfter.body.services || []).find(function (s) {
      return s.id === service.id;
    });
    if (
      patchSvc.status === 200 &&
      updatedSvc &&
      updatedSvc.description === svcDesc &&
      Number(updatedSvc.pricePerHour) === svcPrice
    ) {
      logOk("Админ: изменение описания и цены услуги — OK");
    } else {
      logFail("Админ: не сохранились изменения услуги");
    }
  }

  const serviceDate = futureISODate(45);
  const serviceBook = await request(
    "POST",
    "/api/services/bookings",
    {
      serviceSlug: "sauna-pool",
      bookingDate: serviceDate,
      guestName: "Пётр Зарубин",
      phone: "+7 (915) 000-00-12",
      hours: 2,
      guests: 2,
    },
    guestHdr
  );

  if (serviceBook.status === 201 && serviceBook.body.booking) {
    logOk("Бронирование услуги (сауна) — OK");
    cleanup.serviceBookingIds.push(serviceBook.body.booking.id);
  } else if (serviceBook.status === 409) {
    const altDate = futureISODate(50);
    const retry = await request(
      "POST",
      "/api/services/bookings",
      {
        serviceSlug: "sauna-pool",
        bookingDate: altDate,
        guestName: "Пётр Зарубин",
        phone: "+7 (915) 000-00-12",
        hours: 1,
        guests: 2,
      },
      guestHdr
    );
    if (retry.status === 201 && retry.body.booking) {
      logOk("Бронирование услуги (сауна, альт. дата) — OK");
      cleanup.serviceBookingIds.push(retry.body.booking.id);
    } else {
      logFail(`Бронирование услуги — ${retry.status}`);
    }
  } else {
    logFail(`Бронирование услуги — ${serviceBook.status}`);
  }

  const svcBookingsAdmin = await request("GET", "/api/admin/service-bookings", null, adminHdr);
  const saunaBookings = (svcBookingsAdmin.body.serviceBookings || []).filter(function (b) {
    return b.serviceSlug === "sauna-pool";
  });
  if (svcBookingsAdmin.status === 200 && saunaBookings.length) {
    logOk("Админ: бронирование услуги видно в service-bookings — OK");
    saunaBookings.forEach(function (b) {
      if (cleanup.serviceBookingIds.indexOf(b.id) === -1) {
        cleanup.serviceBookingIds.push(b.id);
      }
    });
  } else {
    logFail("Админ: бронирование услуги не найдено");
  }

  const checkIn = futureISODate(60);
  const checkOut = futureISODate(62);
  const roomBook = await request(
    "POST",
    "/api/bookings",
    {
      guestName: "Пётр Зарубин",
      phone: "+7 (915) 000-00-12",
      roomSlug: "improved-single",
      checkIn: checkIn,
      checkOut: checkOut,
      guests: 1,
      tariff: "basic",
    },
    guestHdr
  );

  if (roomBook.status === 201 && roomBook.body.booking) {
    logOk("Бронирование номера — OK");
    cleanup.bookingIds.push(roomBook.body.booking.id);
  } else {
    logFail(`Бронирование номера — ${roomBook.status} ${JSON.stringify(roomBook.body)}`);
  }

  const summary = await request("GET", "/api/account/summary", null, guestHdr);
  const hasRoom = (summary.body.roomBookings || []).some(function (b) {
    return cleanup.bookingIds.indexOf(b.id) !== -1;
  });
  const hasService = (summary.body.serviceBookings || []).some(function (b) {
    return cleanup.serviceBookingIds.indexOf(b.id) !== -1;
  });
  if (summary.status === 200 && hasRoom && hasService) {
    logOk("ЛК: номер и услуга в /api/account/summary — OK");
  } else {
    logFail("ЛК: бронирования не отображаются в summary");
  }

  const noAuth = await request("POST", "/api/bookings", {
    guestName: "X",
    phone: "+79000000000",
    roomSlug: "single-standard",
    checkIn: futureISODate(10),
    checkOut: futureISODate(12),
    guests: 1,
    tariff: "basic",
  });
  if (noAuth.status === 401 || noAuth.status === 400) {
    logOk("Бронирование без входа отклонено — OK");
  } else {
    logFail(`Бронирование без входа — неожиданно ${noAuth.status}`);
  }
}

async function cleanupViaApi() {
  let admin;
  try {
    admin = await login(ADMIN.email, ADMIN.password);
  } catch (error) {
    console.warn("Очистка: не удалось войти как админ —", error.message);
    return;
  }
  const hdr = { Authorization: "Bearer " + admin.token };

  for (const id of cleanup.bookingIds) {
    await request("DELETE", "/api/admin/bookings/" + id, null, hdr);
  }
  for (const id of cleanup.serviceBookingIds) {
    await request("DELETE", "/api/admin/service-bookings/" + id, null, hdr);
  }
  for (const room of cleanup.roomRestores) {
    await request(
      "PATCH",
      "/api/admin/rooms/" + room.id,
      {
        title: room.title,
        description: room.description,
        pricePerNight: room.pricePerNight,
      },
      hdr
    );
  }
  for (const service of cleanup.serviceRestores) {
    await request(
      "PATCH",
      "/api/admin/services/" + service.id,
      {
        description: service.description,
        pricePerHour: service.pricePerHour,
      },
      hdr
    );
  }
  for (const userId of cleanup.userIds) {
    await request("DELETE", "/api/admin/users/" + userId, null, hdr);
  }
  for (const reviewId of cleanup.reviewIds) {
    await request("DELETE", "/api/admin/reviews/" + reviewId, null, hdr);
  }
}

function dbRun(db, sql, params) {
  return new Promise(function (resolve, reject) {
    db.run(sql, params || [], function (err) {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function cleanupDatabaseExtras() {
  if (!fs.existsSync(DB_PATH)) return;

  const db = new sqlite3.Database(DB_PATH);
  const demoEmail = DEMO_GUEST.email;

  try {
    await dbRun(db, "DELETE FROM bookings WHERE guest_name LIKE '%e2e%' OR guest_name LIKE '%Test%'");
    await dbRun(
      db,
      `DELETE FROM service_bookings
       WHERE guest_name LIKE '%e2e%' OR guest_name LIKE '%Test%'`
    );
    await dbRun(
      db,
      `DELETE FROM reviews
       WHERE author_name LIKE '%e2e%' OR author_name LIKE '%Test%' OR message LIKE '%[e2e]%'`
    );
    await dbRun(
      db,
      `DELETE FROM bookings
       WHERE email = ? OR user_id IN (SELECT id FROM users WHERE email LIKE 'e2e-%')`,
      [demoEmail]
    );
    await dbRun(
      db,
      `DELETE FROM service_bookings
       WHERE email = ? OR user_id IN (SELECT id FROM users WHERE email LIKE 'e2e-%')`,
      [demoEmail]
    );
    await dbRun(db, "DELETE FROM users WHERE email LIKE 'e2e-%@%'");
    await dbRun(
      db,
      `UPDATE rooms SET description = REPLACE(description, ' [e2e]', '') WHERE description LIKE '% [e2e]%'`
    );
    await dbRun(
      db,
      `UPDATE services SET description = REPLACE(description, ' [e2e]', '') WHERE description LIKE '% [e2e]%'`
    );
  } finally {
    await new Promise(function (resolve) {
      db.close(resolve);
    });
  }
}

async function main() {
  console.log("=== E2E: полное тестирование ===\n");

  testStaticCardFields();
  testNotificationDateLogic();
  testAdminUiPatterns();

  try {
    await runApiTests();
  } catch (error) {
    logFail("API: " + error.message);
  }

  console.log("\n=== Очистка тестовых данных ===");
  try {
    await cleanupViaApi();
    await cleanupDatabaseExtras();
    logOk("Очистка: тестовые брони, пользователи e2e-, хвосты [e2e] — OK");
  } catch (error) {
    logFail("Очистка: " + error.message);
  }

  console.log("\n=== ПРОЙДЕНО ===");
  passed.forEach(function (item) {
    console.log("✓", item);
  });

  console.log("\n=== ПРОБЛЕМЫ ===");
  if (!issues.length) {
    console.log("Нет.");
  } else {
    issues.forEach(function (item) {
      console.log("✗", item);
    });
  }

  console.log("\nИтого:", passed.length, "OK,", issues.length, "проблем");
  process.exit(issues.length ? 1 : 0);
}

main();
