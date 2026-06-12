const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..");
const issues = [];
const passed = [];

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

function fileExists(relativePath) {
  const full = path.join(ROOT, relativePath);
  return fs.existsSync(full) && fs.statSync(full).isFile();
}

function checkHtmlAssets() {
  const htmlFiles = fs.readdirSync(ROOT).filter(function (f) {
    return f.endsWith(".html");
  });

  for (const file of htmlFiles) {
    const content = fs.readFileSync(path.join(ROOT, file), "utf8");
    const refs = content.match(/\b(?:href|src)=["']([^"']+)["']/gi) || [];

    for (const ref of refs) {
      const match = ref.match(/["']([^"']+)["']/i);
      if (!match) continue;
      let link = match[1].trim();
      if (
        !link ||
        link.startsWith("http") ||
        link.startsWith("//") ||
        link.startsWith("mailto:") ||
        link.startsWith("tel:")
      ) {
        continue;
      }
      if (link.startsWith("#")) continue;

      link = link.split("#")[0].split("?")[0];
      if (!link) continue;

      const base = path.dirname(file);
      const resolved = path.normalize(path.join(ROOT, base, link));
      if (!resolved.startsWith(ROOT)) {
        issues.push(`HTML: ${file} — подозрительная ссылка ${link}`);
        continue;
      }

      const rel = path.relative(ROOT, resolved).replace(/\\/g, "/");
      if (!fileExists(rel)) {
        issues.push(`HTML: ${file} — файл не найден: ${link}`);
      }
    }
  }

  if (!issues.some(function (i) {
    return i.startsWith("HTML:");
  })) {
    passed.push("HTML: локальные ссылки и ресурсы — OK");
  }
}

function checkJsSyntax() {
  ["js/script.js", "js/admin.js"].forEach(function (rel) {
    const code = fs.readFileSync(path.join(ROOT, rel), "utf8");
    try {
      new Function(code);
      passed.push(`JS syntax: ${rel} — OK`);
    } catch (error) {
      issues.push(`JS syntax: ${rel} — ${error.message}`);
    }
  });
}

async function checkApiFlows() {
  const admin = await request("POST", "/api/auth/login", {
    email: "forestsorokin338@mail.ru",
    password: "Shohte12",
  });
  if (admin.status === 200 && admin.body.user && admin.body.user.role === "admin") {
    passed.push("API: вход администратора — OK");
  } else {
    issues.push(`API: вход администратора — ${admin.status}`);
  }

  const guest = await request("POST", "/api/auth/login", {
    email: "greter12@mail.ru",
    password: "great123",
  });
  if (guest.status === 200 && guest.body.token) {
    passed.push("API: вход гостя — OK");
  } else {
    issues.push(`API: вход гостя — ${guest.status}`);
  }

  if (admin.body.token) {
    const stats = await request("GET", "/api/admin/stats", null, {
      Authorization: "Bearer " + admin.body.token,
    });
    if (stats.status === 200) passed.push("API: /api/admin/stats — OK");
    else issues.push(`API: /api/admin/stats — ${stats.status}`);
  }

  const reviews = await request("GET", "/api/reviews");
  if (reviews.status === 200 && Array.isArray(reviews.body.reviews)) {
    passed.push(`API: отзывы (${reviews.body.reviews.length}) — OK`);
    const bad = reviews.body.reviews.filter(function (r) {
      return r.status && r.status !== "approved";
    });
    if (bad.length) {
      issues.push("API: в публичных отзывах есть не approved");
    }
  } else {
    issues.push("API: GET /api/reviews — ошибка");
  }

  const guestNoAuth = await request("POST", "/api/bookings", {
    guestName: "Test Guest",
    phone: "+79001234567",
    roomSlug: "single-standard",
    checkIn: "2026-07-01",
    checkOut: "2026-07-03",
    guests: 1,
    tariff: "basic",
  });
  if (guestNoAuth.status === 201) {
    issues.push(
      "API: бронирование без входа разрешено на сервере (фронт требует вход — расхождение)"
    );
  } else if (guestNoAuth.status === 400 || guestNoAuth.status === 401) {
    passed.push("API: бронирование без токена отклонено/ограничено — OK");
  }

  if (guest.body.token) {
    const future = new Date();
    future.setMonth(future.getMonth() + 8);
    const checkIn = future.toISOString().slice(0, 10);
    const checkOutDate = new Date(future);
    checkOutDate.setDate(checkOutDate.getDate() + 2);
    const checkOut = checkOutDate.toISOString().slice(0, 10);

    const book = await request(
      "POST",
      "/api/bookings",
      {
        guestName: "Пётр Зарубин",
        phone: "+79150000012",
        email: "greter12@mail.ru",
        roomSlug: "single-standard",
        checkIn: checkIn,
        checkOut: checkOut,
        guests: 1,
        tariff: "basic",
      },
      { Authorization: "Bearer " + guest.body.token }
    );
    if (book.status === 201) passed.push("API: бронирование с токеном — OK");
    else
      issues.push(
        `API: бронирование с токеном — ${book.status} ${JSON.stringify(book.body)}`
      );
  }
}

function checkFrontendPatterns() {
  const script = fs.readFileSync(path.join(ROOT, "js", "script.js"), "utf8");

  if (!script.includes("data-reviews-summary-stars")) {
    issues.push("JS: нет привязки data-reviews-summary-stars для звёзд отзывов");
  } else {
    passed.push("JS: динамические звёзды отзывов — OK");
  }

  if (!script.includes("requireAuthForBooking")) {
    issues.push("JS: нет проверки входа перед оплатой");
  } else {
    passed.push("JS: requireAuthForBooking — OK");
  }

  if (script.includes("user.isBlocked")) {
    const authRoute = fs.readFileSync(
      path.join(ROOT, "Server", "routes", "auth.js"),
      "utf8"
    );
    if (!authRoute.includes("isBlocked")) {
      issues.push(
        "JS: проверка user.isBlocked, но API не отдаёт isBlocked в /api/auth/me"
      );
    } else {
      passed.push("API: isBlocked в профиле пользователя — OK");
    }
  }

  const reviewsHtml = fs.readFileSync(path.join(ROOT, "reviews.html"), "utf8");
  if (!reviewsHtml.includes("data-reviews-summary-stars")) {
    issues.push("HTML: reviews.html — контейнер звёзд сводки не обновлён");
  }

  const roomHtml = fs.readFileSync(
    path.join(ROOT, "room-improved-double.html"),
    "utf8"
  );
  if (!roomHtml.includes('name="card-number"')) {
    issues.push("HTML: страница номера — нет полей карты в модалке");
  } else {
    passed.push("HTML: поля карты на странице номера — OK");
  }

  const bookingHtml = fs.readFileSync(path.join(ROOT, "booking.html"), "utf8");
  if (!bookingHtml.includes('name="card-number"')) {
    issues.push("HTML: booking.html — нет полей карты в модалке оплаты");
  } else {
    passed.push("HTML: поля карты в модалке booking.html — OK");
  }

  const servicesHtml = fs.readFileSync(path.join(ROOT, "services.html"), "utf8");
  if (!servicesHtml.includes('name="card-number"')) {
    issues.push("HTML: services.html — нет полей карты в модалке оплаты");
  } else {
    passed.push("HTML: поля карты в модалке services.html — OK");
  }
}

async function main() {
  checkHtmlAssets();
  checkJsSyntax();
  checkFrontendPatterns();

  try {
    await checkApiFlows();
  } catch (error) {
    issues.push(`API: сервер недоступен — ${error.message}`);
  }

  console.log("\n=== ПРОЙДЕНО ===");
  passed.forEach(function (item) {
    console.log("✓", item);
  });

  console.log("\n=== ПРОБЛЕМЫ / ЗАМЕЧАНИЯ ===");
  if (!issues.length) {
    console.log("Критичных находок нет.");
  } else {
    issues.forEach(function (item) {
      console.log("✗", item);
    });
  }

  console.log("\nИтого:", passed.length, "OK,", issues.length, "замечаний");
  process.exit(issues.length ? 1 : 0);
}

main();
