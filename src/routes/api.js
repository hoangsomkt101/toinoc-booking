const express = require('express');
const bookingService = require('../services/bookings');
const { badRequest } = require('../domain/errors');
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

router.get(
  '/online-users',
  requireManager,
  asyncHandler(async (req, res) => {
    const realtime = req.app.locals.realtime;
    res.json({ data: realtime ? realtime.getOnlineUsers() : [] });
  })
);

module.exports = router;
