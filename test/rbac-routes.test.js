const test = require('node:test');
const assert = require('node:assert/strict');
const apiClientRouter = require('../src/routes/api-clients');
const apiRouter = require('../src/routes/api');
const areaRouter = require('../src/routes/areas');
const bookingRouter = require('../src/routes/bookings');
const branchRouter = require('../src/routes/branches');
const sheetSettingsRouter = require('../src/routes/sheet-settings');
const userRouter = require('../src/routes/users');

function routeGuard(router, path, method) {
  const layer = router.stack.find((item) => item.route && item.route.path === path && item.route.methods[method]);

  assert.ok(layer, `Missing route ${method.toUpperCase()} ${path}`);
  return layer.route.stack[0].handle;
}

function invokeGuard(guard, role) {
  let nextError;
  const req = { user: role ? { role } : null };

  guard(req, {}, (error) => {
    nextError = error;
  });

  return nextError;
}

function assertAllowed(guard, role) {
  assert.equal(invokeGuard(guard, role), undefined);
}

function assertDenied(guard, role, statusCode = 403) {
  const error = invokeGuard(guard, role);

  assert.equal(error && error.statusCode, statusCode);
}

test('sale can create and list bookings without management actions', () => {
  assertAllowed(routeGuard(bookingRouter, '/', 'post'), 'sale');
  assertAllowed(routeGuard(bookingRouter, '/', 'get'), 'sale');

  for (const [path, method] of [
    ['/:id', 'get'],
    ['/:id', 'put'],
    ['/:id', 'delete'],
    ['/:id/assign', 'post'],
    ['/:id/check-in', 'post'],
    ['/:id/check-out', 'post'],
    ['/:id/cancel', 'post']
  ]) {
    assertDenied(routeGuard(bookingRouter, path, method), 'sale');
  }
});

test('manager can operate bookings and choose table data but cannot manage users', () => {
  for (const [path, method] of [
    ['/', 'post'],
    ['/', 'get'],
    ['/:id', 'get'],
    ['/:id', 'put'],
    ['/:id', 'delete'],
    ['/:id/assign', 'post'],
    ['/:id/check-in', 'post'],
    ['/:id/check-out', 'post'],
    ['/:id/cancel', 'post']
  ]) {
    assertAllowed(routeGuard(bookingRouter, path, method), 'manager');
  }

  assertAllowed(routeGuard(apiRouter, '/dashboard', 'get'), 'manager');
  assertAllowed(routeGuard(apiRouter, '/tables', 'get'), 'manager');
  assertAllowed(routeGuard(branchRouter, '/', 'get'), 'manager');
  assertAllowed(routeGuard(branchRouter, '/:id', 'get'), 'manager');
  assertAllowed(routeGuard(areaRouter, '/', 'get'), 'manager');
  assertAllowed(routeGuard(areaRouter, '/:id', 'get'), 'manager');

  for (const [path, method] of [
    ['/', 'get'],
    ['/', 'post'],
    ['/:id', 'get'],
    ['/:id', 'put'],
    ['/:id', 'delete']
  ]) {
    assertDenied(routeGuard(userRouter, path, method), 'manager');
  }
});

test('sale cannot read operational dashboard, table, branch, area, or user APIs', () => {
  for (const [router, path, method] of [
    [apiRouter, '/dashboard', 'get'],
    [apiRouter, '/tables', 'get'],
    [apiRouter, '/online-users', 'get'],
    [branchRouter, '/', 'get'],
    [branchRouter, '/:id', 'get'],
    [areaRouter, '/', 'get'],
    [areaRouter, '/:id', 'get'],
    [userRouter, '/', 'get']
  ]) {
    assertDenied(routeGuard(router, path, method), 'sale');
  }
});

test('only admin can manage API client settings', () => {
  for (const [path, method] of [
    ['/', 'get'],
    ['/', 'post'],
    ['/:id', 'put'],
    ['/:id', 'delete'],
    ['/:id/rotate-key', 'post']
  ]) {
    const guard = routeGuard(apiClientRouter, path, method);
    assertAllowed(guard, 'admin');
    assertDenied(guard, 'manager');
    assertDenied(guard, 'sale');
    assertDenied(guard, null, 401);
  }
});

test('only admin can manage sheet settings', () => {
  for (const [path, method] of [
    ['/', 'get'],
    ['/', 'post'],
    ['/:id', 'put'],
    ['/:id', 'delete']
  ]) {
    const guard = routeGuard(sheetSettingsRouter, path, method);
    assertAllowed(guard, 'admin');
    assertDenied(guard, 'manager');
    assertDenied(guard, 'sale');
    assertDenied(guard, null, 401);
  }
});

test('admin passes all guarded route categories', () => {
  for (const [router, path, method] of [
    [bookingRouter, '/', 'post'],
    [bookingRouter, '/:id/assign', 'post'],
    [apiClientRouter, '/', 'get'],
    [sheetSettingsRouter, '/', 'get'],
    [apiRouter, '/dashboard', 'get'],
    [branchRouter, '/', 'post'],
    [branchRouter, '/:id', 'put'],
    [areaRouter, '/', 'post'],
    [areaRouter, '/:id', 'delete'],
    [userRouter, '/', 'get'],
    [userRouter, '/:id', 'delete']
  ]) {
    assertAllowed(routeGuard(router, path, method), 'admin');
  }
});

test('guarded routes reject missing sessions', () => {
  assertDenied(routeGuard(bookingRouter, '/', 'post'), null, 401);
});
