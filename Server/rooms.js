const ROOMS = {
  "single-standard": {
    name: "Одноместный стандарт 1 категории",
    maxGuests: 1,
    prices: { basic: 2400, "half-board": 2850, "full-board": 3300 },
  },
  "improved-single": {
    name: "Улучшенный одноместный стандарт 1 категории",
    maxGuests: 1,
    prices: { basic: 3400, "half-board": 3850, "full-board": 4300 },
  },
  "improved-double": {
    name: "Двухместный улучшенный стандарт",
    maxGuests: 2,
    prices: { basic: 3600, "half-board": 4500, "full-board": 5400 },
  },
  "lux-single": {
    name: "Люкс одноместный",
    maxGuests: 1,
    prices: { basic: 5000, "half-board": 5450, "full-board": 5900 },
  },
};

const TARIFFS = ["basic", "half-board", "full-board"];

function getRoom(slug) {
  return ROOMS[slug] || null;
}

function listRooms() {
  return Object.entries(ROOMS).map(function ([slug, room]) {
    return {
      slug,
      name: room.name,
      maxGuests: room.maxGuests,
      prices: room.prices,
    };
  });
}

module.exports = {
  ROOMS,
  TARIFFS,
  getRoom,
  listRooms,
};
