const test = require('node:test');
const assert = require('node:assert/strict');
const bookingService = require('../src/services/bookings');
const { pool } = require('../src/db/pool');

const originalConnect = pool.connect.bind(pool);

function mockPoolTransaction(handler) {
  const queries = [];

  pool.connect = async () => ({
    async query(sql, params = []) {
      const text = String(sql);
      queries.push({ sql: text, params });

      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) {
        return { rowCount: 0, rows: [] };
      }

      return handler(text, params);
    },
    release() {}
  });

  return queries;
}

test.afterEach(() => {
  pool.connect = originalConnect;
});

test('booking list exposes customer visit counters', async () => {
  let capturedSql = '';
  const executor = {
    async query(sql) {
      capturedSql = String(sql);
      return { rows: [] };
    }
  };

  await bookingService.listBookings({}, executor);

  assert.match(capturedSql, /COALESCE\(customer_stats\.customer_booking_count, 1\) AS customer_booking_count/);
  assert.match(capturedSql, /COALESCE\(customer_stats\.customer_previous_booking_count, 0\) \+ 1 AS customer_visit_number/);
  assert.match(capturedSql, /LEFT JOIN LATERAL \(\s+SELECT\s+COUNT\(\*\)::INTEGER AS customer_booking_count/s);
  assert.match(capturedSql, /history\.booking_time < b\.booking_time/);
  assert.match(capturedSql, /history\.booking_time = b\.booking_time AND history\.id < b\.id/);
  assert.match(capturedSql, /history\.customer_id = b\.customer_id/);
  assert.match(capturedSql, /history\.phone = b\.phone/);
});

test('table status data combines tables and date scoped open bookings', async () => {
  const capturedSql = [];
  const executor = {
    async query(sql) {
      capturedSql.push(String(sql));
      return { rows: [] };
    }
  };

  const result = await bookingService.listTableStatuses({ branch_id: '7', booking_date: '2026-06-22' }, executor);

  assert.deepEqual(result, { tables: [], bookings: [] });
  assert.equal(capturedSql.length, 2);
  assert.match(capturedSql[0], /FROM tables t/);
  assert.match(capturedSql[0], /t\.branch_id = \$1/);
  assert.match(capturedSql[1], /FROM bookings b/);
  assert.match(capturedSql[1], /b\.branch_id = \$1/);
  assert.match(capturedSql[1], /b\.booking_time >= \$2::date/);
  assert.match(capturedSql[1], /b\.status IN \('PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'\)/);
});

test('quick table status available clears assignment and reopens checked-in booking', async () => {
  const bookingRow = {
    id: 20,
    customer_id: null,
    branch_id: 1,
    area_id: null,
    branch_name: 'Chi nhánh 1',
    branch_address: '',
    area_name: null,
    customer_name: 'Khách A',
    phone: '0900000000',
    booking_time: '2026-06-22T12:00:00.000Z',
    guest_count: 4,
    order_staff_name: null,
    note: null,
    status: 'CONFIRMED',
    actual_guest_count: null,
    check_in_at: null,
    check_out_at: null,
    created_at: null,
    updated_at: null,
    customer_booking_count: 1,
    customer_previous_booking_count: 0,
    customer_visit_number: 1,
    assigned_tables: [],
    status_logs: []
  };
  const queries = mockPoolTransaction(async (sql, params = []) => {
    if (/SELECT id, status\s+FROM tables/s.test(sql)) {
      assert.deepEqual(params, [9]);
      return { rowCount: 1, rows: [{ id: 9, status: 'OCCUPIED' }] };
    }

    if (/SELECT b\.\*\s+FROM booking_tables/s.test(sql)) {
      assert.deepEqual(params, [9, ['PENDING', 'CONFIRMED', 'CHECKED_IN']]);
      return { rowCount: 1, rows: [{ id: 20, status: 'CHECKED_IN', guest_count: 4 }] };
    }

    if (/SELECT table_id FROM booking_tables WHERE booking_id = \$1/.test(sql)) {
      assert.deepEqual(params, [20]);
      return { rowCount: 2, rows: [{ table_id: 9 }, { table_id: 10 }] };
    }

    if (/DELETE FROM booking_tables WHERE booking_id = \$1/.test(sql)) {
      assert.deepEqual(params, [20]);
      return { rowCount: 2, rows: [] };
    }

    if (/UPDATE bookings SET area_id = NULL WHERE id = \$1/.test(sql)) {
      assert.deepEqual(params, [20]);
      return { rowCount: 1, rows: [] };
    }

    if (/UPDATE bookings\s+SET status = 'CONFIRMED'/s.test(sql)) {
      assert.deepEqual(params, [20]);
      return { rowCount: 1, rows: [] };
    }

    if (/INSERT INTO booking_status_logs/.test(sql)) {
      assert.deepEqual(params.slice(0, 3), [20, 'CHECKED_IN', 'CONFIRMED']);
      return { rowCount: 1, rows: [] };
    }

    if (/UPDATE tables t\s+SET status = CASE/s.test(sql)) {
      assert.deepEqual(params[0], [9, 10]);
      return { rowCount: 2, rows: [] };
    }

    if (/FROM tables t\s+JOIN branches br ON br\.id = t\.branch_id\s+WHERE t\.id = \$1/s.test(sql)) {
      assert.deepEqual(params, [9]);
      return {
        rowCount: 1,
        rows: [{ id: 9, branch_id: 1, branch_name: 'Chi nhánh 1', table_code: '9', capacity: 4, status: 'AVAILABLE' }]
      };
    }

    if (/FROM bookings b/s.test(sql) && /WHERE b\.id = \$1/.test(sql)) {
      assert.deepEqual(params, [20]);
      return { rowCount: 1, rows: [bookingRow] };
    }

    throw new Error(`Unexpected query: ${sql}`);
  });

  const result = await bookingService.updateQuickTableStatus(9, { status: 'AVAILABLE', booking_id: 20 });

  assert.equal(result.table.status, 'AVAILABLE');
  assert.equal(result.booking.status, 'CONFIRMED');
  assert.deepEqual(result.booking.assigned_tables, []);
  assert.ok(queries.some((query) => /DELETE FROM booking_tables WHERE booking_id = \$1/.test(query.sql)));
});

test('create booking with table ids assigns tables and skips walk-in customer upsert', async () => {
  const bookingRow = {
    id: 31,
    customer_id: null,
    branch_id: 1,
    area_id: 2,
    branch_name: 'Chi nhánh 1',
    branch_address: '',
    area_name: 'Trong nhà',
    customer_name: 'Vãng lai',
    phone: '000',
    booking_time: '2027-01-01T11:00:00.000Z',
    guest_count: 8,
    order_staff_name: null,
    note: null,
    status: 'CONFIRMED',
    actual_guest_count: null,
    check_in_at: null,
    check_out_at: null,
    created_at: null,
    updated_at: null,
    customer_booking_count: 1,
    customer_previous_booking_count: 0,
    customer_visit_number: 1,
    assigned_tables: [
      { id: 9, table_code: '9', capacity: 4, status: 'RESERVED' },
      { id: 10, table_code: '10', capacity: 4, status: 'RESERVED' }
    ],
    status_logs: []
  };
  let insertedBookingParams;
  const insertedTables = [];

  const queries = mockPoolTransaction(async (sql, params = []) => {
    if (/SELECT id FROM branches WHERE id = \$1/.test(sql)) {
      assert.deepEqual(params, [1]);
      return { rowCount: 1, rows: [{ id: 1 }] };
    }

    if (/SELECT id FROM areas WHERE id = \$1 AND branch_id = \$2/.test(sql)) {
      assert.deepEqual(params, [2, 1]);
      return { rowCount: 1, rows: [{ id: 2 }] };
    }

    if (/SELECT id, branch_id, table_code, status\s+FROM tables/s.test(sql)) {
      assert.deepEqual(params, [[9, 10]]);
      return {
        rowCount: 2,
        rows: [
          { id: 9, branch_id: 1, table_code: '9', status: 'AVAILABLE' },
          { id: 10, branch_id: 1, table_code: '10', status: 'AVAILABLE' }
        ]
      };
    }

    if (/FROM booking_tables bt\s+JOIN bookings b ON b\.id = bt\.booking_id/s.test(sql) && /b\.status = ANY\(\$2::TEXT\[\]\)/.test(sql)) {
      assert.deepEqual(params[0], [9, 10]);
      assert.deepEqual(params[1], ['PENDING', 'CONFIRMED', 'CHECKED_IN']);
      return { rowCount: 0, rows: [] };
    }

    if (/INSERT INTO bookings/.test(sql)) {
      insertedBookingParams = params;
      return { rowCount: 1, rows: [{ id: 31 }] };
    }

    if (/INSERT INTO booking_status_logs/.test(sql)) {
      return { rowCount: 1, rows: [] };
    }

    if (/INSERT INTO booking_tables \(booking_id, table_id\)/.test(sql)) {
      insertedTables.push(params);
      return { rowCount: 1, rows: [] };
    }

    if (/UPDATE bookings SET status = 'CONFIRMED'/.test(sql)) {
      assert.deepEqual(params, [31]);
      return { rowCount: 1, rows: [] };
    }

    if (/UPDATE tables t\s+SET status = CASE/s.test(sql)) {
      assert.deepEqual(params[0], [9, 10]);
      return { rowCount: 2, rows: [] };
    }

    if (/FROM bookings b/s.test(sql) && /WHERE b\.id = \$1/.test(sql)) {
      assert.deepEqual(params, [31]);
      return { rowCount: 1, rows: [bookingRow] };
    }

    throw new Error(`Unexpected query: ${sql}`);
  });

  const originalPoolQuery = pool.query;
  pool.query = async () => ({ rows: [] });
  let result;

  try {
    result = await bookingService.createBooking({
      customer_name: '',
      phone: '',
      booking_time: '2027-01-01T18:00',
      guest_count: '8',
      branch_id: '1',
      area_id: '2',
      table_ids: ['9', '10']
    });
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    pool.query = originalPoolQuery;
  }

  assert.equal(result.status, 'CONFIRMED');
  assert.equal(result.customer_id, null);
  assert.equal(result.phone, '000');
  assert.equal(insertedBookingParams[0], null);
  assert.equal(insertedBookingParams[3], 'Vãng lai');
  assert.equal(insertedBookingParams[4], '000');
  assert.deepEqual(insertedTables, [[31, 9], [31, 10]]);
  assert.ok(!queries.some((query) => /INSERT INTO customers/.test(query.sql)));
});
