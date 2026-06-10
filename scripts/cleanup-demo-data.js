const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const dbPath = path.join(__dirname, "..", "Server", "olymp.db");
const db = new sqlite3.Database(dbPath);

db.serialize(function () {
  db.run("DELETE FROM bookings WHERE email = 'greter12@mail.ru'");
  db.run("DELETE FROM service_bookings WHERE email = 'greter12@mail.ru'");
  db.run("DELETE FROM users WHERE email LIKE 'e2e-%@%'");
  db.run("DELETE FROM reviews WHERE author_name LIKE '%e2e%' OR message LIKE '%[e2e]%'");
  db.run(
    "UPDATE rooms SET description = REPLACE(description, ' [e2e]', '') WHERE description LIKE '% [e2e]%'"
  );
  db.run(
    "UPDATE services SET description = REPLACE(description, ' [e2e]', '') WHERE description LIKE '% [e2e]%'"
  );
});

db.close(function () {
  console.log("Демо-данные очищены.");
});
