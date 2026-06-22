const express = require('express');
const bookingService = require('../services/bookings');
const { badRequest } = require('../domain/errors');
const { SOCKET_EVENTS } = require('../domain/constants');
const { requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/async-handler');

const router = express.Router();
const requireManager = requireRole('manager');

function scopedBranchQuery(req) {
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

router.get(
  '/dashboard',
  requireManager,
  asyncHandler(async (req, res) => {
    const dashboard = await bookingService.getDashboardData(scopedBranchQuery(req));
    res.json({ data: dashboard });
  })
);

router.get(
  '/tables',
  requireManager,
  asyncHandler(async (req, res) => {
    const tables = await bookingService.listTables(scopedBranchQuery(req));
    res.json({ data: tables });
  })
);

router.patch(
  '/tables/:id/status',
  requireManager,
  asyncHandler(async (req, res) => {
    const result = await bookingService.updateQuickTableStatus(req.params.id, req.body);
    broadcast(req, SOCKET_EVENTS.table_assignment_changed, result);
    if (result.booking) {
      broadcast(req, SOCKET_EVENTS.booking_updated, result.booking);
    }
    res.json({ data: result });
  })
);

router.get(
  '/table-statuses',
  requireManager,
  asyncHandler(async (req, res) => {
    const tableStatuses = await bookingService.listTableStatuses(scopedBranchQuery(req));
    res.json({ data: tableStatuses });
  })
);

router.get(
  '/online-users',
  requireManager,
  asyncHandler(async (req, res) => {
    const realtime = req.app.locals.realtime;
    res.json({ data: realtime ? realtime.getOnlineUsers() : [] });
  })
);

module.exports = router;
