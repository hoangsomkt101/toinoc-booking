const test = require('node:test');
const assert = require('node:assert/strict');
const customerService = require('../src/services/customers');
const customerRouter = require('../src/routes/customers');

function routeHandler(path, method) {
  const layer = customerRouter.stack.find((item) => item.route && item.route.path === path && item.route.methods[method]);

  assert.ok(layer, `Missing route ${method.toUpperCase()} ${path}`);
  return layer.route.stack.at(-1).handle;
}

function invokeRoute(path, query) {
  return new Promise((resolve, reject) => {
    routeHandler(path, 'get')(
      { query, user: { role: 'sale', branch_id: 7 } },
      { json: resolve },
      reject
    );
  });
}

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

test('customer name search uses only the trigram-friendly name predicate for text', async () => {
  let capturedSql = '';
  let capturedParams = [];
  const executor = {
    async query(sql, params = []) {
      capturedSql = String(sql);
      capturedParams = params;
      return { rows: [] };
    }
  };

  await customerService.listCustomers({ q: 'Nguyễn' }, executor);

  assert.deepEqual(capturedParams, ['%Nguyễn%']);
  assert.match(capturedSql, /c\.customer_name ILIKE \$1/);
  assert.doesNotMatch(capturedSql, /c\.phone LIKE/);
});

test('customer numeric search checks indexed name and phone predicates', async () => {
  let capturedSql = '';
  let capturedParams = [];
  const executor = {
    async query(sql, params = []) {
      capturedSql = String(sql);
      capturedParams = params;
      return { rows: [] };
    }
  };

  await customerService.listCustomers({ q: '090-12' }, executor);

  assert.deepEqual(capturedParams, ['%090-12%', '%09012%']);
  assert.match(capturedSql, /c\.customer_name ILIKE \$1 OR c\.phone LIKE \$2/);
});

test('booking phone lookup and suggestions ignore branch scope', async () => {
  const originalLookup = customerService.lookupCustomerByPhone;
  const originalSuggest = customerService.suggestCustomersByPhone;
  const calls = [];

  customerService.lookupCustomerByPhone = async (...args) => {
    calls.push({ type: 'lookup', args });
    return { customer: null, recent_bookings: [] };
  };
  customerService.suggestCustomersByPhone = async (...args) => {
    calls.push({ type: 'suggest', args });
    return [];
  };

  try {
    await invokeRoute('/lookup', { phone: '0909000000', branch_id: '99' });
    await invokeRoute('/suggest', { phone: '090', branch_id: '99' });
  } finally {
    customerService.lookupCustomerByPhone = originalLookup;
    customerService.suggestCustomersByPhone = originalSuggest;
  }

  assert.deepEqual(calls, [
    { type: 'lookup', args: ['0909000000'] },
    { type: 'suggest', args: ['090'] }
  ]);
});
