const test = require('node:test');
const assert = require('node:assert/strict');
const sheetSettingsService = require('../src/services/sheet-settings');
const { pool } = require('../src/db/pool');

const originalQuery = pool.query.bind(pool);

function mockPoolQuery(handler) {
  pool.query = handler;
}

test.afterEach(() => {
  pool.query = originalQuery;
});

test('sheet settings rejects branch selection', async () => {
  await assert.rejects(
    () => sheetSettingsService.createSheetTarget({
      name: 'Sheet chia chi nhanh',
      target_type: 'BRANCH',
      branch_id: '1',
      webhook_url: 'https://script.google.com/macros/s/test/exec',
      is_active: true
    }),
    /Không cần chọn chi nhánh/
  );
});

test('sheet settings allows only one link per target type', async () => {
  mockPoolQuery(async (sql, params = []) => {
    if (String(sql).includes('WHERE target_type = $1')) {
      assert.deepEqual(params, ['BRANCH']);
      return { rowCount: 1, rows: [{ id: 10 }] };
    }

    throw new Error(`Unexpected query: ${sql}`);
  });

  await assert.rejects(
    () => sheetSettingsService.createSheetTarget({
      name: 'Sheet chia chi nhanh',
      target_type: 'BRANCH',
      webhook_url: 'https://script.google.com/macros/s/test/exec',
      is_active: true
    }),
    /Mỗi loại Sheet chỉ được cấu hình một link/
  );
});

test('sheet settings treats Apps Script error payload as sync failure', () => {
  assert.throws(
    () => sheetSettingsService._private.assertSheetResponseSuccess({
      status: 'error',
      message: 'address is not defined'
    }),
    /Apps Script error: address is not defined/
  );
});
