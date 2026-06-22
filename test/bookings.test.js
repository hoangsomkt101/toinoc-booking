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
