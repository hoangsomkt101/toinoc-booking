const express = require('express');
const customerService = require('../services/customers');
const { badRequest } = require('../domain/errors');
const { requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/async-handler');

const router = express.Router();
const requireCustomerLookup = requireRole('sale');
const requireCustomerManage = requireRole('manager');

function scopedCustomerQuery(req) {
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
  '/lookup',
  requireCustomerLookup,
  asyncHandler(async (req, res) => {
    if (!req.query.phone) {
      throw badRequest('Số điện thoại là bắt buộc');
    }

    const result = await customerService.lookupCustomerByPhone(req.query.phone, scopedCustomerQuery(req));
    res.json({ data: result });
  })
);

router.get(
  '/suggest',
  requireCustomerLookup,
  asyncHandler(async (req, res) => {
    if (!req.query.phone) {
      throw badRequest('Số điện thoại là bắt buộc');
    }

    const customers = await customerService.suggestCustomersByPhone(req.query.phone, scopedCustomerQuery(req));
    res.json({ data: customers });
  })
);

router.get(
  '/',
  requireCustomerManage,
  asyncHandler(async (req, res) => {
    const customers = await customerService.listCustomers(scopedCustomerQuery(req));
    res.json({ data: customers });
  })
);

router.get(
  '/:id',
  requireCustomerManage,
  asyncHandler(async (req, res) => {
    const customer = await customerService.getCustomerById(req.params.id, scopedCustomerQuery(req));
    res.json({ data: customer });
  })
);

router.get(
  '/:id/bookings',
  requireCustomerManage,
  asyncHandler(async (req, res) => {
    const bookings = await customerService.listCustomerBookings(req.params.id, scopedCustomerQuery(req));
    res.json({ data: bookings });
  })
);

router.put(
  '/:id',
  requireCustomerManage,
  asyncHandler(async (req, res) => {
    const customer = await customerService.updateCustomer(req.params.id, req.body, scopedCustomerQuery(req));
    res.json({ data: customer });
  })
);

module.exports = router;
