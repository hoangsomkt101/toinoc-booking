const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SESSION_COOKIE,
  createSessionValue,
  loadSession,
  normalizeRole,
  readSessionValue,
  requireRole
} = require('../src/middleware/auth');
const { hashPassword, verifyPassword } = require('../src/domain/passwords');
const { canManageUser } = require('../src/services/users');

const sessionUser = {
  id: 1,
  branch_id: 1,
  username: 'manager',
  display_name: 'Manager Demo',
  role: 'manager'
};

function invoke(middleware, { user, cookie } = {}) {
  let nextError;
  const req = {
    headers: cookie ? { cookie } : {},
    path: '/api/example',
    accepts: () => false,
    user
  };
  const res = { locals: {} };

  middleware(req, res, (error) => {
    nextError = error;
  });

  return { req, res, error: nextError };
}

test('normalizeRole accepts configured API roles and staff role aliases', () => {
  assert.equal(normalizeRole('admin'), 'admin');
  assert.equal(normalizeRole('Manager'), 'manager');
  assert.equal(normalizeRole('Sale'), 'sale');
  assert.equal(normalizeRole('Owner'), 'admin');
  assert.equal(normalizeRole('unknown'), null);
});

test('session values round-trip and expose the stored role', () => {
  const sessionValue = createSessionValue(sessionUser);
  const session = readSessionValue(sessionValue);

  assert.deepEqual(session, sessionUser);
});

test('loadSession reads signed session cookies into req.user', () => {
  const sessionValue = createSessionValue({ ...sessionUser, role: 'sale', username: 'sale', display_name: 'Sale Demo' });
  const { req, res, error } = invoke(loadSession, { cookie: `${SESSION_COOKIE}=${encodeURIComponent(sessionValue)}` });

  assert.equal(error, undefined);
  assert.deepEqual(req.user, { ...sessionUser, role: 'sale', username: 'sale', display_name: 'Sale Demo' });
  assert.deepEqual(res.locals.currentUser, req.user);
});

test('password hashes verify only the original password', () => {
  const encodedPassword = hashPassword('admin123');

  assert.equal(verifyPassword('admin123', encodedPassword), true);
  assert.equal(verifyPassword('wrong', encodedPassword), false);
});

test('requireRole allows higher session roles through the hierarchy', () => {
  const middleware = requireRole('manager');
  const { req, error } = invoke(middleware, { user: { role: 'admin' } });

  assert.equal(error, undefined);
  assert.deepEqual(req.user, { role: 'admin' });
});

test('requireRole rejects lower and missing session roles', () => {
  const middleware = requireRole('manager');

  assert.equal(invoke(middleware, { user: { role: 'sale' } }).error.statusCode, 403);
  assert.equal(invoke(middleware).error.statusCode, 401);
});

test('only admin can manage user accounts', () => {
  assert.equal(canManageUser({ role: 'admin' }, { role: 'admin', branch_id: null }), true);
  assert.equal(canManageUser({ role: 'manager', branch_id: 1 }, { role: 'sale', branch_id: 1 }), false);
  assert.equal(canManageUser({ role: 'manager', branch_id: 1 }, { role: 'sale', branch_id: 2 }), false);
  assert.equal(canManageUser({ role: 'manager', branch_id: 1 }, { role: 'manager', branch_id: 1 }), false);
  assert.equal(canManageUser({ role: 'sale', branch_id: 1 }, { role: 'sale', branch_id: 1 }), false);
});
