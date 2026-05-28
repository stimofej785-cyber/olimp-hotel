const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..");
const issues = [];
const passed = [];

function readHtmlFiles(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith(".html")).map((f) => path.join(dir, f));
}

function checkHtml() {
  const files = readHtmlFiles(ROOT);
  for (const file of files) {
    const name = path.basename(file);
    const content = fs.readFileSync(file, "utf8");

    if (/social-max\.svg[\s\S]{0,120}href="#"/i.test(content) || /href="#"[^>]*social-max/i.test(content)) {
      issues.push(`HTML: ${name} — ссылка Max ведёт на #`);
    }
    if (/name="card-number"|name="card-cvv"|name="cardholder"/i.test(content)) {
      issues.push(`HTML: ${name} — остались поля банковской карты`);
    }
    if (/РђРґРјР|РћР»РёРјР|РќРѕРјРµСЂР/i.test(content)) {
      issues.push(`HTML: ${name} — битая кодировка UTF-8`);
    }
    if (!/<meta charset="UTF-8"/i.test(content)) {
      issues.push(`HTML: ${name} — нет meta charset UTF-8`);
    }
  }
  if (!issues.some((i) => i.startsWith("HTML:"))) {
    passed.push("HTML: базовые проверки (Max, карты, UTF-8) — OK");
  }
}

function checkJs() {
  const script = fs.readFileSync(path.join(ROOT, "js", "script.js"), "utf8");
  const admin = fs.readFileSync(path.join(ROOT, "js", "admin.js"), "utf8");

  const badPatterns = [
    ["setPasswordPreview", "хранение пароля в sessionStorage"],
    ["validatePaymentCard", "старая валидация карты"],
    ["cardholderInput", "ссылка на удалённое поле cardholder"],
  ];

  for (const [pattern, desc] of badPatterns) {
    if (script.includes(pattern) || admin.includes(pattern)) {
      issues.push(`JS: ${desc} (${pattern})`);
    }
  }

  if (!issues.some((i) => i.startsWith("JS:"))) {
    passed.push("JS: критичные паттерны безопасности — OK");
  }
}

function checkRoutes() {
  try {
    require(path.join(ROOT, "Server", "routes", "auth.js"));
    require(path.join(ROOT, "Server", "routes", "bookings.js"));
    require(path.join(ROOT, "Server", "routes", "account.js"));
    require(path.join(ROOT, "Server", "routes", "admin.js"));
    passed.push("Server: маршруты загружаются без ошибок");
  } catch (error) {
    issues.push(`Server: ошибка загрузки маршрутов — ${error.message}`);
  }
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
          let json = null;
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

async function checkApi() {
  try {
    const health = await request("GET", "/api/health");
    if (health.status !== 200) issues.push(`API: /api/health → ${health.status}`);
    else passed.push("API: /api/health — 200");

    const db = await request("GET", "/Server/olymp.db");
    if (db.status === 200) issues.push("SECURITY: БД доступна по HTTP (/Server/olymp.db)");
    else passed.push("SECURITY: БД закрыта от статики — 404");

    const bookingsGet = await request("GET", "/api/bookings");
    if (bookingsGet.status === 200) issues.push("SECURITY: GET /api/bookings публичен");
    else passed.push("SECURITY: GET /api/bookings закрыт");

    const reviews = await request("GET", "/api/reviews");
    if (reviews.status !== 200 || !reviews.body.reviews) {
      issues.push("API: GET /api/reviews не отдаёт отзывы");
    } else {
      passed.push(`API: GET /api/reviews — ${reviews.body.reviews.length} отзывов`);
    }

    const badLogin = await request("POST", "/api/auth/login", {
      email: "not-an-email",
      password: "123",
    });
    if (badLogin.status !== 400 && badLogin.status !== 401) {
      issues.push(`API: login с невалидным email → ${badLogin.status} (ожидали 400/401)`);
    } else {
      passed.push("API: валидация login — отклоняет неверные данные");
    }

    const noAuthAccount = await request("GET", "/api/account/summary");
    if (noAuthAccount.status !== 401) {
      issues.push(`SECURITY: /api/account/summary без токена → ${noAuthAccount.status}`);
    } else {
      passed.push("SECURITY: /api/account/summary требует авторизацию");
    }

    const adminNoAuth = await request("GET", "/api/admin/stats");
    if (adminNoAuth.status !== 401) {
      issues.push(`SECURITY: /api/admin/stats без токена → ${adminNoAuth.status}`);
    } else {
      passed.push("SECURITY: /api/admin/stats требует авторизацию");
    }

    const badBooking = await request("POST", "/api/bookings", {
      guestName: "A",
      phone: "+7999",
      roomSlug: "single-standard",
      checkIn: "2020-01-01",
      checkOut: "2020-01-02",
      guests: 1,
      tariff: "basic",
    });
    if (badBooking.status !== 400) {
      issues.push(`API: POST /api/bookings с прошлой датой → ${badBooking.status} (ожидали 400)`);
    } else {
      passed.push("API: бронирование отклоняет прошлые даты");
    }
  } catch (error) {
    issues.push(`API: сервер недоступен на localhost:3000 — ${error.message}`);
  }
}

async function main() {
  checkHtml();
  checkJs();
  checkRoutes();
  await checkApi();

  console.log("\n=== ПРОЙДЕНО ===");
  passed.forEach(function (item) {
    console.log("✓", item);
  });

  console.log("\n=== ПРОБЛЕМЫ ===");
  if (!issues.length) {
    console.log("Критичных автоматических находок нет.");
  } else {
    issues.forEach(function (item) {
      console.log("✗", item);
    });
  }

  console.log("\nИтого:", passed.length, "OK,", issues.length, "замечаний");
  process.exit(issues.length ? 1 : 0);
}

main();
