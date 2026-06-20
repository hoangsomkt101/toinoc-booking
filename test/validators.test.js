const test = require('node:test');
const assert = require('node:assert/strict');
const { BOOKING_STATUSES, SOCKET_EVENTS, TABLE_STATUSES } = require('../src/domain/constants');
const { normalizePhone, normalizeTableIds, validateBookingPayload } = require('../src/domain/validators');
const { normalizeAreaUpdatePayload, normalizeBranchAreasPayload } = require('../src/services/branches');
const { generateApiKey, hashApiKey, normalizeAllowedOrigin } = require('../src/services/api-clients');
const { branchSeeds, tableNumbers } = require('../src/db/seed');

test('booking and table statuses preserve the spec values', () => {
  assert.deepEqual(BOOKING_STATUSES, [
    'PENDING',
    'CONFIRMED',
    'CANCELLED',
    'NO_SHOW',
    'CHECKED_IN',
    'CHECKED_OUT',
    'COMPLETED'
  ]);
  assert.deepEqual(TABLE_STATUSES, ['AVAILABLE', 'RESERVED', 'OCCUPIED', 'BLOCKED']);
});

test('socket event names preserve snake_case values', () => {
  assert.equal(SOCKET_EVENTS.booking_created, 'booking_created');
  assert.equal(SOCKET_EVENTS.booking_updated, 'booking_updated');
  assert.equal(SOCKET_EVENTS.booking_cancelled, 'booking_cancelled');
  assert.equal(SOCKET_EVENTS.booking_assigned, 'booking_assigned');
  assert.equal(SOCKET_EVENTS.booking_checked_in, 'booking_checked_in');
  assert.equal(SOCKET_EVENTS.booking_checked_out, 'booking_checked_out');
  assert.equal(SOCKET_EVENTS.table_assignment_changed, 'table_assignment_changed');
  assert.equal(SOCKET_EVENTS.staff_online, 'staff_online');
  assert.equal(SOCKET_EVENTS.staff_offline, 'staff_offline');
});

test('validateBookingPayload normalizes create input', () => {
  const payload = validateBookingPayload({
    customer_name: '  Linh Nguyen  ',
    phone: ' 0909000000 ',
    booking_time: '2027-01-01T18:30:00+07:00',
    guest_count: '4',
    order_staff_name: '  Bạn Hoa  ',
    note: ' Birthday ',
    branch_id: '1',
    area_id: '2'
  });

  assert.equal(payload.customer_name, 'Linh Nguyen');
  assert.equal(payload.phone, '0909000000');
  assert.equal(payload.guest_count, 4);
  assert.equal(payload.order_staff_name, 'Bạn Hoa');
  assert.equal(payload.note, 'Birthday');
  assert.equal(payload.branch_id, 1);
  assert.equal(payload.area_id, 2);
  assert.ok(payload.booking_time instanceof Date);
});

test('normalizePhone stores a stable customer key', () => {
  assert.equal(normalizePhone(' 090 900 0000 '), '0909000000');
  assert.equal(normalizePhone('+84 90 900 0000'), '0909000000');
  assert.equal(normalizePhone('0084-90-900-0000'), '0909000000');
});

test('validateBookingPayload treats local booking times as Vietnam time', () => {
  const basePayload = {
    customer_name: 'Linh Nguyen',
    phone: '0909000000',
    guest_count: '4',
    branch_id: '1'
  };

  assert.equal(
    validateBookingPayload({ ...basePayload, booking_time: '2027-01-01T17:00' }).booking_time.toISOString(),
    '2027-01-01T10:00:00.000Z'
  );
  assert.equal(
    validateBookingPayload({ ...basePayload, booking_time: '2027-01-01T17:30' }).booking_time.toISOString(),
    '2027-01-01T10:30:00.000Z'
  );
});

test('normalizeTableIds accepts table_ids or table_id and removes duplicates', () => {
  assert.deepEqual(normalizeTableIds({ table_ids: ['3', 1, '3', 2] }), [1, 2, 3]);
  assert.deepEqual(normalizeTableIds({ table_id: '7' }), [7]);
});

test('normalizeBranchAreasPayload normalizes area names without table ownership', () => {
  const areas = normalizeBranchAreasPayload([
    { name: ' VIP ', table_count: '2', capacity: '', table_prefix: '' },
    { name: 'Garden', table_count: 4, capacity: 6, table_prefix: 'G' }
  ], { required: true });

  assert.deepEqual(areas, [
    { name: 'VIP' },
    { name: 'Garden' }
  ]);
});

test('normalizeBranchAreasPayload rejects duplicate area names in one branch', () => {
  assert.throws(
    () => normalizeBranchAreasPayload([
      { name: 'VIP', table_count: 1 },
      { name: ' vip ', table_count: 2 }
    ], { required: true }),
    /Tên khu vực không được trùng trong cùng chi nhánh/
  );
});

test('normalizeAreaUpdatePayload validates and trims the area name', () => {
  assert.deepEqual(normalizeAreaUpdatePayload({ name: '  Sân thượng  ' }), { name: 'Sân thượng' });
  assert.throws(() => normalizeAreaUpdatePayload({}), /Chưa cung cấp thông tin khu vực cần cập nhật/);
  assert.throws(() => normalizeAreaUpdatePayload({ name: ' ' }), /Tên khu vực là bắt buộc/);
});

test('restaurant source seed preserves branch, area, and table counts', () => {
  const summary = branchSeeds.map((branch) => ({
    name: branch.name,
    areas: branch.areas.map((area) => area.name),
    tables: tableNumbers(branch).length
  }));

  assert.deepEqual(summary, [
    { name: 'Quận 1', areas: ['Trong nhà', 'Vỉa hè', 'Trên lầu'], tables: 48 },
    { name: 'Bình Thạnh', areas: ['Trong nhà', 'Vỉa hè', 'Trên lầu', 'Tiệm phở'], tables: 49 },
    { name: 'Quận 10', areas: ['Trong nhà', 'Vỉa hè'], tables: 96 }
  ]);
});

test('restaurant source seed addresses match sheet routing keywords', () => {
  const addresses = Object.fromEntries(branchSeeds.map((branch) => [branch.name, branch.address.toLowerCase()]));

  assert.match(addresses['Quận 1'], /võ văn kiệt/);
  assert.match(addresses['Bình Thạnh'], /điện biên phủ/);
  assert.match(addresses['Quận 10'], /thành thái/);
});

test('normalizeAllowedOrigin stores exact URL origins for public API clients', () => {
  assert.equal(normalizeAllowedOrigin('example.com/path?x=1'), 'https://example.com');
  assert.equal(normalizeAllowedOrigin('http://localhost:8080/test'), 'http://localhost:8080');
  assert.throws(() => normalizeAllowedOrigin('not a domain'), /URL hợp lệ/);
});

test('API keys are generated with stable hashable format', () => {
  const apiKey = generateApiKey();

  assert.match(apiKey, /^rb_live_/);
  assert.equal(hashApiKey(apiKey), hashApiKey(apiKey));
  assert.notEqual(hashApiKey(apiKey), apiKey);
});
