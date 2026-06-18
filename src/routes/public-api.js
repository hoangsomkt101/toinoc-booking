const express = require('express');
const bookingService = require('../services/bookings');
const branchService = require('../services/branches');
const { publicApiOptions, requirePublicApiClient, requirePublicApiOrigin } = require('../middleware/public-api');
const asyncHandler = require('../middleware/async-handler');
const { SOCKET_EVENTS } = require('../domain/constants');

const router = express.Router();

function broadcast(req, eventName, payload) {
  if (req.app.locals.realtime) {
    req.app.locals.realtime.broadcast(eventName, payload);
  }
}

router.options('/branches', publicApiOptions);
router.options('/bookings', publicApiOptions);

router.get(
  '/branches',
  requirePublicApiOrigin,
  asyncHandler(async (req, res) => {
    const branches = await branchService.listPublicBranches();
    res.json({ data: branches });
  })
);

router.post(
  '/bookings',
  requirePublicApiClient,
  asyncHandler(async (req, res) => {
    const booking = await bookingService.createBooking(req.body);
    broadcast(req, SOCKET_EVENTS.booking_created, booking);
    res.status(201).json({ data: booking });
  })
);

module.exports = router;
