const MAX_GUESTS = 2;

const SERVICE_MAX_GUESTS = {
  "conference-hall": 40,
  "sauna-pool": 10,
};

const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 64;
const EMAIL_MAX_LENGTH = 100;
const NAME_MAX_LENGTH = 80;
const NAME_MIN_LENGTH = 2;
const MAX_BOOKING_YEARS_AHEAD = 2;
const MAX_TEXT_LENGTH = 2000;
const PHONE_MAX_LENGTH = 32;
const EMAIL_PATTERN = /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function clampGuestCount(value, max) {
  const limit = Number.isInteger(max) && max > 0 ? max : MAX_GUESTS;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(limit, n);
}

function getServiceMaxGuests(slug) {
  return SERVICE_MAX_GUESTS[slug] || MAX_GUESTS;
}

function localISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function maxBookingDateISO() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setFullYear(date.getFullYear() + MAX_BOOKING_YEARS_AHEAD);
  return localISODate(date);
}

function getEmailStructureError(email) {
  const value = String(email || "").trim();
  if (!value.includes("@")) {
    return "Укажите полный email с @ и доменом, например name@gmail.com или name@mail.ru.";
  }
  if ((value.match(/@/g) || []).length !== 1) {
    return "Email должен содержать один символ @.";
  }
  const parts = value.split("@");
  const localPart = parts[0];
  const domainPart = parts[1];
  if (!localPart || !domainPart) {
    return "Укажите имя и домен почты через @, например name@gmail.com.";
  }
  if (!domainPart.includes(".")) {
    return "Укажите домен после @, например gmail.com, mail.ru, yandex.ru или outlook.com.";
  }
  if (domainPart.startsWith(".") || domainPart.endsWith(".") || domainPart.includes("..")) {
    return "Некорректный домен email.";
  }
  const tld = domainPart.split(".").pop();
  if (!tld || tld.length < 2) {
    return "Укажите полный домен, например gmail.com или outlook.com.";
  }
  return "";
}

function validateEmail(email) {
  const value = String(email || "").trim();
  if (!value) return "Укажите email.";
  if (value.length > EMAIL_MAX_LENGTH) {
    return "Email не должен быть длиннее " + EMAIL_MAX_LENGTH + " символов.";
  }
  const structureError = getEmailStructureError(value);
  if (structureError) return structureError;
  if (!EMAIL_PATTERN.test(value)) {
    return "Укажите корректный email, например name@gmail.com или name@mail.ru.";
  }
  return "";
}

function validatePassword(password) {
  const value = String(password || "");
  if (!value) return "Укажите пароль.";
  if (value.length < PASSWORD_MIN_LENGTH) {
    return "Пароль должен содержать не менее " + PASSWORD_MIN_LENGTH + " символов.";
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return "Пароль не должен быть длиннее " + PASSWORD_MAX_LENGTH + " символов.";
  }
  return "";
}

function validatePersonName(name, required) {
  const value = String(name || "").trim();
  if (!value) return required ? "Укажите имя." : "";
  if (value.length < NAME_MIN_LENGTH) {
    return "Имя должно содержать минимум " + NAME_MIN_LENGTH + " символа.";
  }
  if (value.length > NAME_MAX_LENGTH) {
    return "Имя не должно быть длиннее " + NAME_MAX_LENGTH + " символов.";
  }
  return "";
}

function isBookingDateWithinRange(isoDate) {
  const parts = String(isoDate || "").trim().split("-");
  if (parts.length !== 3) return false;

  const y = Number(parts[0]);
  const m = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  const date = new Date(y, m, d);
  if (Number.isNaN(date.getTime())) return false;
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const maxParts = maxBookingDateISO().split("-");
  const maxDate = new Date(Number(maxParts[0]), Number(maxParts[1]) - 1, Number(maxParts[2]));

  return date >= today && date <= maxDate;
}

function validatePhone(phone, required) {
  const value = String(phone || "").trim();
  if (!value) return required ? "Укажите телефон." : "";
  if (value.length > PHONE_MAX_LENGTH) {
    return "Телефон не должен быть длиннее " + PHONE_MAX_LENGTH + " символов.";
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    return "Укажите корректный номер телефона.";
  }
  return "";
}

function validateTextLength(text, fieldLabel, required) {
  const value = String(text || "").trim();
  if (!value) return required ? "Укажите " + fieldLabel + "." : "";
  if (value.length > MAX_TEXT_LENGTH) {
    return fieldLabel + " не должно быть длиннее " + MAX_TEXT_LENGTH + " символов.";
  }
  return "";
}

module.exports = {
  MAX_GUESTS,
  SERVICE_MAX_GUESTS,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  MAX_BOOKING_YEARS_AHEAD,
  MAX_TEXT_LENGTH,
  PHONE_MAX_LENGTH,
  clampGuestCount,
  getServiceMaxGuests,
  maxBookingDateISO,
  validateEmail,
  validatePassword,
  validatePersonName,
  validatePhone,
  validateTextLength,
  isBookingDateWithinRange,
};
