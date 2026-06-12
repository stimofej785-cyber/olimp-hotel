const DEFAULT_ADMIN_EMAIL = "admin@olimp.ru";
const DEFAULT_DEMO_EMAIL = "user@olimp.ru";

const LOGIN_ALIASES = {
  admin: "ADMIN_EMAIL",
  user: "DEMO_USER_EMAIL",
};

function resolveLoginEmail(rawInput) {
  const normalized = String(rawInput || "").trim().toLowerCase();
  const envKey = LOGIN_ALIASES[normalized];

  if (envKey) {
    const fromEnv = String(process.env[envKey] || "").trim().toLowerCase();
    if (fromEnv) return fromEnv;
    return normalized === "admin" ? DEFAULT_ADMIN_EMAIL : DEFAULT_DEMO_EMAIL;
  }

  return normalized;
}

function isLoginAlias(rawInput) {
  const normalized = String(rawInput || "").trim().toLowerCase();
  return Boolean(LOGIN_ALIASES[normalized]);
}

module.exports = {
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_DEMO_EMAIL,
  resolveLoginEmail,
  isLoginAlias,
};
