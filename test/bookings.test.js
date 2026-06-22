const test = require('node:test');
const assert = require('node:assert/strict');
const bookingService = require('../src/services/bookings');

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
