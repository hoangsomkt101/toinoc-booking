const test = require('node:test');
const assert = require('node:assert/strict');
const customerService = require('../src/services/customers');

test('customer booking counters ignore branch scope', async () => {
  let capturedSql = '';
  let capturedParams = [];
  const executor = {
    async query(sql, params = []) {
      capturedSql = String(sql);
      capturedParams = params;
      return { rows: [] };
    }
  };

  await customerService.listCustomers({ branch_id: '7' }, executor);

  assert.deepEqual(capturedParams, [7]);
  assert.match(capturedSql, /EXISTS \(\s+SELECT 1\s+FROM bookings b\s+WHERE \(b\.customer_id = c\.id OR b\.phone = c\.phone\)\s+AND b\.branch_id = \$1/s);

  const statsSql = capturedSql.match(/LEFT JOIN LATERAL \(\s+SELECT\s+COUNT\(\*\)::INTEGER AS booking_count[\s\S]*?\) stats ON TRUE/)[0];
  assert.doesNotMatch(statsSql, /b\.branch_id/);
});
