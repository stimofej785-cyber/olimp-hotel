const express = require("express");
const cors = require("cors");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");

try {
  require("dotenv").config({ path: path.join(ROOT_DIR, ".env") });
} catch (error) {
  /* dotenv опционален до npm install */
}

const { initDatabase } = require("./db");
const { createRateLimiter } = require("./middleware/rateLimit");
const bookingsRouter = require("./routes/bookings");
const reviewsRouter = require("./routes/reviews");
const servicesRouter = require("./routes/services");
const authRouter = require("./routes/auth");
const adminRouter = require("./routes/admin");
const inquiriesRouter = require("./routes/inquiries");
const roomsRouter = require("./routes/rooms");
const accountRouter = require("./routes/account");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const BLOCKED_STATIC = /^\/(server|node_modules|\.git)(\/|$)/i;

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

function getCorsOrigin() {
  const raw = String(process.env.CORS_ORIGIN || "http://localhost:3000").trim();
  if (raw.includes(",")) {
    return raw.split(",").map(function (item) {
      return item.trim();
    });
  }
  return raw;
}

const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: function (req) {
    return (req.ip || "unknown") + ":" + req.path;
  },
});

app.use(
  cors({
    origin: getCorsOrigin(),
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "64kb" }));

app.use(function (req, res, next) {
  const urlPath = req.path.toLowerCase();

  if (
    BLOCKED_STATIC.test(urlPath) ||
    urlPath.endsWith(".db") ||
    urlPath === "/package.json" ||
    urlPath === "/package-lock.json" ||
    urlPath.endsWith(".env")
  ) {
    return res.status(404).json({ error: "Маршрут не найден." });
  }

  next();
});

app.get("/", function (req, res) {
  res.sendFile(path.join(ROOT_DIR, "index.html"));
});

app.use(
  express.static(ROOT_DIR, {
    dotfiles: "deny",
    index: false,
  })
);

app.get("/api/health", function (req, res) {
  res.json({ ok: true, service: "olymp-booking-api" });
});

app.use("/api/auth/login", authRateLimit);
app.use("/api/auth/register", authRateLimit);
app.use("/api/auth/forgot-password", authRateLimit);
app.use("/api/auth/reset-password", authRateLimit);
app.use("/api/auth", authRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/services", servicesRouter);
app.use("/api/rooms", roomsRouter);
app.use("/api/inquiries", inquiriesRouter);
app.use("/api/account", accountRouter);
app.use("/api/admin", adminRouter);

app.use(function (req, res) {
  res.status(404).json({ error: "Маршрут не найден." });
});

app.use(function (err, req, res, next) {
  console.error(err);
  res.status(500).json({ error: "Внутренняя ошибка сервера." });
});

initDatabase()
  .then(function () {
    app.listen(PORT, HOST, function () {
      const localUrl =
        HOST === "0.0.0.0" ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;
      console.log(`Server started on ${localUrl}`);
      console.log(`Booking API: POST ${localUrl}/api/bookings`);
      if (process.env.NODE_ENV === "production") {
        console.log("Production mode (NODE_ENV=production)");
      }
    });
  })
  .catch(function (err) {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
