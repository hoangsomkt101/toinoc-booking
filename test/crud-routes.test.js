const test = require('node:test');
const assert = require('node:assert/strict');
const apiClientRouter = require('../src/routes/api-clients');
const apiRouter = require('../src/routes/api');
const bookingRouter = require('../src/routes/bookings');
const branchRouter = require('../src/routes/branches');
const customerRouter = require('../src/routes/customers');
const publicApiRouter = require('../src/routes/public-api');
const sheetSettingsRouter = require('../src/routes/sheet-settings');
const userRouter = require('../src/routes/users');

function routeMethods(router) {
  return router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).sort()
    }));
}

test('booking API exposes CRUD routes and lifecycle actions', () => {
  assert.deepEqual(routeMethods(bookingRouter), [
    { path: '/', methods: ['post'] },
    { path: '/', methods: ['get'] },
    { path: '/:id', methods: ['get'] },
    { path: '/:id', methods: ['put'] },
    { path: '/:id', methods: ['delete'] },
    { path: '/:id/assign', methods: ['post'] },
    { path: '/:id/check-in', methods: ['post'] },
    { path: '/:id/check-out', methods: ['post'] },
    { path: '/:id/cancel', methods: ['post'] }
  ]);
});

test('operational API exposes dashboard and table status routes', () => {
  assert.deepEqual(routeMethods(apiRouter), [
    { path: '/dashboard', methods: ['get'] },
    { path: '/tables', methods: ['get'] },
    { path: '/table-statuses', methods: ['get'] },
    { path: '/online-users', methods: ['get'] }
  ]);
});

test('branch API exposes CRUD routes and nested area creation', () => {
  assert.deepEqual(routeMethods(branchRouter), [
    { path: '/', methods: ['get'] },
    { path: '/', methods: ['post'] },
    { path: '/:id', methods: ['get'] },
    { path: '/:id/areas', methods: ['post'] },
    { path: '/:id', methods: ['put'] },
    { path: '/:id', methods: ['delete'] }
  ]);
});

test('user API exposes full CRUD routes', () => {
  assert.deepEqual(routeMethods(userRouter), [
    { path: '/', methods: ['get'] },
    { path: '/', methods: ['post'] },
    { path: '/:id', methods: ['get'] },
    { path: '/:id', methods: ['put'] },
    { path: '/:id', methods: ['delete'] }
  ]);
});

test('customer API exposes lookup, management and history routes', () => {
  assert.deepEqual(routeMethods(customerRouter), [
    { path: '/lookup', methods: ['get'] },
    { path: '/suggest', methods: ['get'] },
    { path: '/', methods: ['get'] },
    { path: '/:id', methods: ['get'] },
    { path: '/:id/bookings', methods: ['get'] },
    { path: '/:id', methods: ['put'] }
  ]);
});

test('api client API exposes admin lifecycle routes', () => {
  assert.deepEqual(routeMethods(apiClientRouter), [
    { path: '/', methods: ['get'] },
    { path: '/', methods: ['post'] },
    { path: '/:id', methods: ['put'] },
    { path: '/:id', methods: ['delete'] },
    { path: '/:id/rotate-key', methods: ['post'] }
  ]);
});

test('sheet settings API exposes admin CRUD routes', () => {
  assert.deepEqual(routeMethods(sheetSettingsRouter), [
    { path: '/', methods: ['get'] },
    { path: '/', methods: ['post'] },
    { path: '/:id', methods: ['put'] },
    { path: '/:id', methods: ['delete'] }
  ]);
});

test('public API exposes branch read and booking create routes', () => {
  assert.deepEqual(routeMethods(publicApiRouter), [
    { path: '/branches', methods: ['options'] },
    { path: '/bookings', methods: ['options'] },
    { path: '/branches', methods: ['get'] },
    { path: '/bookings', methods: ['post'] }
  ]);
});
