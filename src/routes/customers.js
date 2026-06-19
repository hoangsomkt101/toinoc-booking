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

function hideCustomerPhone(customer) {
  const visibleCustomer = { ...customer };
  delete visibleCustomer.phone;

  return visibleCustomer;
}

function hideBookingPhone(booking) {
  const visibleBooking = { ...booking };
  delete visibleBooking.phone;

  return visibleBooking;
}

function visibleCustomerForUser(customer, user) {
  return user.role === 'admin' ? customer : hideCustomerPhone(customer);
}

function visibleCustomersForUser(customers, user) {
  return user.role === 'admin' ? customers : customers.map(hideCustomerPhone);
}

function visibleBookingsForUser(bookings, user) {
  return user.role === 'admin' ? bookings : bookings.map(hideBookingPhone);
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
    res.json({ data: visibleCustomersForUser(customers, req.user) });
  })
);

router.get(
  '/:id',
  requireCustomerManage,
  asyncHandler(async (req, res) => {
    const customer = await customerService.getCustomerById(req.params.id, scopedCustomerQuery(req));
    res.json({ data: visibleCustomerForUser(customer, req.user) });
  })
);

router.get(
  '/:id/bookings',
  requireCustomerManage,
  asyncHandler(async (req, res) => {
    const bookings = await customerService.listCustomerBookings(req.params.id, scopedCustomerQuery(req));
    res.json({ data: visibleBookingsForUser(bookings, req.user) });
  })
);

router.put(
  '/:id',
  requireCustomerManage,
  asyncHandler(async (req, res) => {
    const customer = await customerService.updateCustomer(req.params.id, req.body, scopedCustomerQuery(req));
    res.json({ data: visibleCustomerForUser(customer, req.user) });
  })
);

module.exports = router;
