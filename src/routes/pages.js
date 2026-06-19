const express = require('express');
const apiClientService = require('../services/api-clients');
const branchService = require('../services/branches');
const bookingService = require('../services/bookings');
const customerService = require('../services/customers');
const sheetSettingsService = require('../services/sheet-settings');
const userService = require('../services/users');
const { ROLE_LEVELS, clearSession, requireAuthenticated, requireRole, setSessionCookie } = require('../middleware/auth');
const asyncHandler = require('../middleware/async-handler');

const router = express.Router();
const ROLE_LABELS = Object.freeze({
  admin: 'Quản trị viên',
  manager: 'Quản lý',
  sale: 'Nhân viên kinh doanh'
});
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function localDateValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60 * 1000;

  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function normalizeDateParam(value) {
  if (!value) {
    return '';
  }

  const dateValue = String(value).trim();
  if (!DATE_ONLY_PATTERN.test(dateValue)) {
    return '';
  }

  const parsed = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateValue) {
    return '';
  }

  return dateValue;
}

function selectedBookingDate(req) {
  return normalizeDateParam(req.query.booking_date) || localDateValue();
}

function publicBranchOptions(branches) {
  return branches.map((branch) => ({
    id: branch.id,
    name: branch.name,
    address: branch.address
  }));
}

function selectedBranchScope(req, branches, canViewAllBranches) {
  const requestedBranchId = req.query.branch_id ? String(req.query.branch_id) : '';

  if (canViewAllBranches) {
    return requestedBranchId;
  }

  const branchIds = branches.map((branch) => String(branch.id));
  if (requestedBranchId && branchIds.includes(requestedBranchId)) {
    return requestedBranchId;
  }

  const userBranchId = req.user.branch_id ? String(req.user.branch_id) : '';
  if (userBranchId && branchIds.includes(userBranchId)) {
    return userBranchId;
  }

  return branchIds[0] || '';
}

function safeNextPath(value) {
  const nextPath = String(value || '/');

  if (!nextPath.startsWith('/') || nextPath.startsWith('//') || nextPath.startsWith('/login')) {
    return '/';
  }

  return nextPath;
}

router.get(
  '/',
  requireAuthenticated,
  asyncHandler(async (req, res) => {
    await renderDashboard(req, res, 'bookings');
  })
);

router.get('/login', (req, res) => {
  if (req.user) {
    return res.redirect('/');
  }

  return res.render('login', {
    bodyClass: 'mobile-app-body',
    title: 'Đăng nhập',
    next: safeNextPath(req.query.next)
  });
});

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const next = safeNextPath(req.body.next);
    const user = await userService.authenticateUser(req.body.username, req.body.password);

    if (!user) {
      return res.status(401).render('login', {
        bodyClass: 'mobile-app-body',
        title: 'Đăng nhập',
        error: 'Tên đăng nhập hoặc mật khẩu không đúng.',
        next,
        username: req.body.username || ''
      });
    }

    setSessionCookie(res, user);
    return res.redirect(next);
  })
);

router.post('/logout', (req, res) => {
  clearSession(res);
  res.redirect('/login');
});

async function renderDashboard(req, res, section) {
  const canCreateBooking = ROLE_LEVELS[req.user.role] >= ROLE_LEVELS.sale;
  const canManageBookings = ROLE_LEVELS[req.user.role] >= ROLE_LEVELS.manager;
  const canManageCustomers = ROLE_LEVELS[req.user.role] >= ROLE_LEVELS.manager;
  const canManageUsers = req.user.role === 'admin';
  const canManageBranches = req.user.role === 'admin';
  const canManageApiSettings = req.user.role === 'admin';
  const canManageSheetSettings = req.user.role === 'admin';
  const canManageSettings = canManageApiSettings || canManageSheetSettings;
  const branches = await branchService.listBranches();
  const realtime = req.app.locals.realtime;
  const visibleBranches = canManageBookings ? branches : publicBranchOptions(branches);
  const selectedBranchId = selectedBranchScope(req, visibleBranches, canManageBranches);
  const scopedQuery = canManageBranches || !selectedBranchId
    ? req.query
    : { ...req.query, branch_id: selectedBranchId };
  const bookingDate = section === 'bookings' ? selectedBookingDate(req) : '';
  const dashboardQuery = bookingDate ? { ...scopedQuery, booking_date: bookingDate } : scopedQuery;
  const isSettingsSection = section === 'setting';
  const [dashboard, bookings, customers, users, apiClients, sheetTargets] = await Promise.all([
    canManageBookings ? bookingService.getDashboardData(dashboardQuery) : {},
    section === 'bookings' && canManageBookings ? bookingService.listBookings(dashboardQuery) : [],
    section === 'customers' && canManageCustomers ? customerService.listCustomers(scopedQuery) : [],
    section === 'users' && canManageUsers ? userService.listUsers(req.user) : [],
    isSettingsSection && canManageApiSettings ? apiClientService.listApiClients() : [],
    isSettingsSection && canManageSheetSettings ? sheetSettingsService.listSheetTargets() : []
  ]);

  res.render('dashboard', {
    bodyClass: 'dashboard-body mobile-app-body',
    bodyId: 'page-top',
    title: 'Tổng quan quản lý đặt bàn',
    isDashboardLayout: true,
    branchQueryString: selectedBranchId ? `?branch_id=${encodeURIComponent(selectedBranchId)}` : '',
    canCreateBooking,
    canManageApiSettings,
    canManageBookings,
    canManageBranches,
    canManageCustomers,
    canManageSettings,
    canManageSheetSettings,
    canManageUsers,
    creatableRoles: ['admin', 'manager', 'sale'].map((role) => ({
      value: role,
      label: ROLE_LABELS[role]
    })),
    currentUser: { ...req.user, role_label: ROLE_LABELS[req.user.role] || req.user.role },
    dashboard,
    dashboardSection: section,
    showOperationsSummary: section === 'bookings' && canManageBookings,
    isBookingsSection: section === 'bookings',
    isBranchesSection: section === 'branches',
    isCustomersSection: section === 'customers',
    isSettingsSection,
    isUsersSection: section === 'users',
    onlineUsers: canManageBranches && realtime ? realtime.getOnlineUsers() : [],
    bookings,
    customers,
    apiClients,
    sheetTargets,
    users,
    selectedBranchId,
    selectedBookingDate: bookingDate,
    branches: visibleBranches
  });
}

router.get(
  '/bookings',
  requireAuthenticated,
  asyncHandler(async (req, res) => {
    await renderDashboard(req, res, 'bookings');
  })
);

router.get(
  '/branches',
  requireAuthenticated,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    await renderDashboard(req, res, 'branches');
  })
);

router.get(
  '/customers',
  requireAuthenticated,
  requireRole('manager'),
  asyncHandler(async (req, res) => {
    await renderDashboard(req, res, 'customers');
  })
);

router.get(
  '/users',
  requireAuthenticated,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    await renderDashboard(req, res, 'users');
  })
);

router.get(
  '/setting',
  requireAuthenticated,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    await renderDashboard(req, res, 'setting');
  })
);

router.get(
  '/user',
  requireAuthenticated,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    await renderDashboard(req, res, 'users');
  })
);

module.exports = router;
