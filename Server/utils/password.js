const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const BCRYPT_ROUNDS = 10;

function isLegacySha256Hash(hash) {
  return /^[a-f0-9]{64}$/i.test(String(hash || ""));
}

async function hashPassword(password) {
  return bcrypt.hash(String(password), BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash) {
  const stored = String(hash || "");

  if (stored.startsWith("$2")) {
    return bcrypt.compare(String(password), stored);
  }

  if (isLegacySha256Hash(stored)) {
    const legacy = crypto.createHash("sha256").update(String(password)).digest("hex");
    return legacy === stored;
  }

  return false;
}

function isLegacyHash(hash) {
  return isLegacySha256Hash(hash);
}

module.exports = {
  hashPassword,
  verifyPassword,
  isLegacyHash,
};
