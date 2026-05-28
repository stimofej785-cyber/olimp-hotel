/**
 * На Railway/Linux предсобранный sqlite3@6 может требовать GLIBC 2.38+.
 * sqlite3@5.1.7 + пересборка на сервере даёт совместимый бинарник.
 */
const { execSync } = require("child_process");

if (process.platform !== "linux" || process.env.SKIP_SQLITE_REBUILD === "1") {
  process.exit(0);
}

try {
  console.log("[postinstall] Rebuilding sqlite3 for this Linux environment...");
  execSync("npm rebuild sqlite3 --build-from-source", {
    stdio: "inherit",
    env: process.env,
  });
  console.log("[postinstall] sqlite3 rebuild OK");
} catch (error) {
  console.warn("[postinstall] sqlite3 rebuild failed, using prebuild:", error.message);
  process.exit(0);
}
