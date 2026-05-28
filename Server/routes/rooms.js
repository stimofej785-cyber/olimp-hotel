const express = require("express");
const { listRoomsWithAvailability } = require("../roomStore");

const router = express.Router();

router.get("/", async function (req, res, next) {
  try {
    const checkIn = String(req.query.checkIn || req.query.checkin || req.query["check-in"] || "").trim();
    const checkOut = String(req.query.checkOut || req.query.checkout || req.query["check-out"] || "").trim();
    const rooms = await listRoomsWithAvailability({
      visibleOnly: true,
      availableOnly: false,
      checkIn: checkIn,
      checkOut: checkOut,
    });
    res.json({ rooms });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
