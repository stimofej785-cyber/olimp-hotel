function calculateServiceTotal(slug, hours, service) {
  const safeHours = Math.max(1, Math.min(24, Math.floor(Number(hours) || 1)));
  const pricePerHour = Number(service && service.pricePerHour) || 0;
  const priceExtraHour = Number(service && service.priceExtraHour) || 0;

  if (slug === "conference-hall") {
    const rate = pricePerHour || 720;
    return safeHours * rate;
  }

  if (slug === "sauna-pool") {
    const firstRate = pricePerHour || 1800;
    const extraRate = priceExtraHour || 1200;

    if (safeHours <= 1) return firstRate;
    if (safeHours === 2) return firstRate * 2;
    return firstRate * 2 + (safeHours - 2) * extraRate;
  }

  return 0;
}

function formatConferencePriceText(pricePerHour) {
  const rate = Number(pricePerHour) || 720;
  return rate + " р/час";
}

function formatSaunaPriceText(pricePerHour, priceExtraHour) {
  const firstRate = Number(pricePerHour) || 1800;
  const extraRate = Number(priceExtraHour) || 1200;
  return firstRate + " руб / 1–2 час, " + extraRate + " руб / 3-й час";
}

module.exports = {
  calculateServiceTotal,
  formatConferencePriceText,
  formatSaunaPriceText,
};
