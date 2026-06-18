const express = require('express');
const bookingService = require('../services/bookings');
const { badRequest } = require('../domain/errors');
const { requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/async-handler');
const { SOCKET_EVENTS } = require('../domain/constants');

const router = express.Router();
const requireBookingCreate = requireRole('sale');
const requireBookingManage = requireRole('manager');

function scopedBookingQuery(req) {
  if (req.user.role === 'admin') {
    return req.query;
  }

  if (req.query.branch_id) {
    return req.query;
  }

  if (req.user.branch_id) {
    return { ...req.query, branch_id: req.user.branch_id };
  }

  throw badRequest('Vui lòng chọn chi nhánh');
}

function broadcast(req, eventName, payload) {
  if (req.app.locals.realtime) {
    req.app.locals.realtime.broadcast(eventName, payload);
  }
}

router.post(
  '/',
  requireBookingCreate,
  asyncHandler(async (req, res) => {
    const booking = await bookingService.createBooking(req.body);
    broadcast(req, SOCKET_EVENTS.booking_created, booking);
    res.status(201).json({ data: booking });
  })
);

router.get(
  '/',
  requireBookingManage,
  asyncHandler(async (req, res) => {
    const bookings = await bookingService.listBookings(scopedBookingQuery(req));
    res.json({ data: bookings });
  })
);

router.get(
  '/:id',
  requireBookingManage,
  asyncHandler(async (req, res) => {
    const booking = await bookingService.getBookingById(req.params.id);
    res.json({ data: booking });
  })
);

router.put(
  '/:id',
  requireBookingManage,
  asyncHandler(async (req, res) => {
    const booking = await bookingService.updateBooking(req.params.id, req.body);
    broadcast(req, SOCKET_EVENTS.booking_updated, booking);
    res.json({ data: booking });
  })
);

router.delete(
  '/:id',
  requireBookingManage,
  asyncHandler(async (req, res) => {
    const booking = await bookingService.deleteBooking(req.params.id);
    broadcast(req, SOCKET_EVENTS.booking_cancelled, booking);
    broadcast(req, SOCKET_EVENTS.table_assignment_changed, booking);
    res.json({ data: booking });
  })
);

router.post(
  '/:id/assign',
  requireBookingManage,
  asyncHandler(async (req, res) => {
    const booking = await bookingService.assignTables(req.params.id, req.body);
    broadcast(req, SOCKET_EVENTS.booking_assigned, booking);
    broadcast(req, SOCKET_EVENTS.table_assignment_changed, booking);
    res.json({ data: booking });
  })
);

router.post(
  '/:id/check-in',
  requireBookingManage,
  asyncHandler(async (req, res) => {
    const booking = await bookingService.checkInBooking(req.params.id, req.body);
    broadcast(req, SOCKET_EVENTS.booking_checked_in, booking);
    res.json({ data: booking });
  })
);

router.post(
  '/:id/check-out',
  requireBookingManage,
  asyncHandler(async (req, res) => {
    const booking = await bookingService.checkOutBooking(req.params.id, req.body);
    broadcast(req, SOCKET_EVENTS.booking_checked_out, booking);
    res.json({ data: booking });
  })
);

router.post(
  '/:id/cancel',
  requireBookingManage,
  asyncHandler(async (req, res) => {
    const booking = await bookingService.cancelBooking(req.params.id);
    broadcast(req, SOCKET_EVENTS.booking_cancelled, booking);
    res.json({ data: booking });
  })
);

module.exports = router;
