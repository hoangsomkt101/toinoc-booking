const { pool } = require('../db/pool');
const { badRequest, conflict, notFound } = require('../domain/errors');
const { parsePositiveInteger } = require('../domain/validators');

const TARGET_TYPES = Object.freeze({
  ALL: 'ALL',
  BRANCH: 'BRANCH'
});
const SYNC_TIMEOUT_MS = 5000;

function normalizeBoolean(value, field) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw badRequest(`${field} phải là true hoặc false`);
}

function normalizeTargetType(value) {
  const targetType = String(value || '').trim().toUpperCase();

  if (!Object.values(TARGET_TYPES).includes(targetType)) {
    throw badRequest('Loại Sheet phải là Sheet tổng hoặc Sheet chia chi nhánh');
  }

  return targetType;
}

function normalizeName(value) {
  const name = String(value || '').trim();

  if (!name) {
    throw badRequest('Tên cấu hình Sheet là bắt buộc');
  }

  if (name.length > 120) {
    throw badRequest('Tên cấu hình Sheet tối đa 120 ký tự');
  }

  return name;
}

function normalizeWebhookUrl(value) {
  const rawValue = String(value || '').trim();

  if (!rawValue) {
    throw badRequest('Link Apps Script là bắt buộc');
  }

  let url;
  try {
    url = new URL(rawValue);
  } catch (error) {
    throw badRequest('Link Apps Script phải là URL hợp lệ');
  }

  if (url.protocol !== 'https:') {
    throw badRequest('Link Apps Script phải dùng HTTPS');
  }

  if (url.username || url.password) {
    throw badRequest('Link Apps Script không được chứa thông tin đăng nhập');
  }

  return url.toString();
}

function normalizeRow(row) {
  return {
    id: Number(row.id),
    name: row.name,
    target_type: row.target_type,
    branch_id: null,
    branch_name: null,
    webhook_url: row.webhook_url,
    is_active: Boolean(row.is_active),
    last_sync_at: row.last_sync_at,
    last_error: row.last_error,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function validateTargetPayload(input = {}, { partial = false } = {}) {
  const data = {};

  if (Object.prototype.hasOwnProperty.call(input, 'name')) {
    data.name = normalizeName(input.name);
  } else if (!partial) {
    throw badRequest('Tên cấu hình Sheet là bắt buộc');
  }

  if (Object.prototype.hasOwnProperty.call(input, 'target_type')) {
    data.target_type = normalizeTargetType(input.target_type);
  } else if (!partial) {
    throw badRequest('Loại Sheet là bắt buộc');
  }

  if (Object.prototype.hasOwnProperty.call(input, 'branch_id') && input.branch_id !== undefined && input.branch_id !== null && input.branch_id !== '') {
    throw badRequest('Không cần chọn chi nhánh cho cấu hình Sheet');
  }

  if (Object.prototype.hasOwnProperty.call(input, 'webhook_url')) {
    data.webhook_url = normalizeWebhookUrl(input.webhook_url);
  } else if (!partial) {
    throw badRequest('Link Apps Script là bắt buộc');
  }

  if (Object.prototype.hasOwnProperty.call(input, 'is_active')) {
    const isActive = normalizeBoolean(input.is_active, 'Trạng thái hoạt động');
    if (isActive === undefined) {
      throw badRequest('Trạng thái hoạt động là bắt buộc');
    }
    data.is_active = isActive;
  }

  return data;
}

async function ensureUniqueWebhookUrl(webhookUrl, exceptId = null) {
  const params = [webhookUrl];
  let exceptSql = '';

  if (exceptId) {
    params.push(exceptId);
    exceptSql = `AND id <> $${params.length}`;
  }

  const result = await pool.query(
    `SELECT id FROM sheet_sync_targets WHERE webhook_url = $1 ${exceptSql}`,
    params
  );

  if (result.rowCount > 0) {
    throw conflict('Link Apps Script này đã được cấu hình');
  }
}

async function ensureUniqueTargetType(targetType, exceptId = null) {
  const params = [targetType];
  let exceptSql = '';

  if (exceptId) {
    params.push(exceptId);
    exceptSql = `AND id <> $${params.length}`;
  }

  const result = await pool.query(
    `SELECT id FROM sheet_sync_targets WHERE target_type = $1 ${exceptSql}`,
    params
  );

  if (result.rowCount > 0) {
    throw conflict('Mỗi loại Sheet chỉ được cấu hình một link');
  }
}

async function listSheetTargets(executor = pool) {
  const result = await executor.query(
    `SELECT sst.id, sst.name, sst.target_type, sst.webhook_url, sst.is_active,
            sst.last_sync_at, sst.last_error, sst.created_at, sst.updated_at
     FROM sheet_sync_targets sst
     ORDER BY CASE sst.target_type WHEN 'ALL' THEN 0 ELSE 1 END, sst.created_at DESC, sst.id DESC`
  );

  return result.rows.map(normalizeRow);
}

async function getSheetTargetById(id, executor = pool) {
  const targetId = parsePositiveInteger(id, 'id');
  const result = await executor.query(
    `SELECT sst.id, sst.name, sst.target_type, sst.webhook_url, sst.is_active,
            sst.last_sync_at, sst.last_error, sst.created_at, sst.updated_at
     FROM sheet_sync_targets sst
     WHERE sst.id = $1`,
    [targetId]
  );

  if (result.rowCount === 0) {
    throw notFound('Không tìm thấy cấu hình Sheet');
  }

  return normalizeRow(result.rows[0]);
}

async function createSheetTarget(input = {}) {
  const data = validateTargetPayload(input);

  await ensureUniqueTargetType(data.target_type);
  await ensureUniqueWebhookUrl(data.webhook_url);

  const result = await pool.query(
    `INSERT INTO sheet_sync_targets (name, target_type, branch_id, webhook_url, is_active)
     VALUES ($1, $2, NULL, $3, $4)
     RETURNING id`,
    [data.name, data.target_type, data.webhook_url, data.is_active === undefined ? true : data.is_active]
  );

  return getSheetTargetById(result.rows[0].id);
}

async function updateSheetTarget(id, input = {}) {
  const current = await getSheetTargetById(id);
  const data = validateTargetPayload(input, { partial: true });
  const updates = [];
  const values = [];

  if (data.target_type) {
    await ensureUniqueTargetType(data.target_type, current.id);
  }
  if (data.webhook_url) {
    await ensureUniqueWebhookUrl(data.webhook_url, current.id);
  }

  function setColumn(column, value) {
    values.push(value);
    updates.push(`${column} = $${values.length}`);
  }

  for (const column of ['name', 'target_type', 'webhook_url', 'is_active']) {
    if (Object.prototype.hasOwnProperty.call(data, column)) {
      setColumn(column, data[column]);
    }
  }

  if (!updates.length) {
    throw badRequest('Chưa cung cấp thông tin Sheet cần cập nhật');
  }

  values.push(current.id);
  await pool.query(`UPDATE sheet_sync_targets SET ${updates.join(', ')} WHERE id = $${values.length}`, values);

  return getSheetTargetById(current.id);
}

async function deleteSheetTarget(id) {
  const targetId = parsePositiveInteger(id, 'id');
  const result = await pool.query(
    `DELETE FROM sheet_sync_targets WHERE id = $1 RETURNING id`,
    [targetId]
  );

  if (result.rowCount === 0) {
    throw notFound('Không tìm thấy cấu hình Sheet');
  }

  return { id: targetId };
}

function formatSheetDate(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(value));
}

function formatSheetTime(value) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(value));
}

function sheetAddress(booking) {
  const address = booking.branch_address || booking.branch_name || String(booking.branch_id);

  return String(address).trim().toLowerCase();
}

function bookingPayload(booking) {
  return {
    date: formatSheetDate(booking.booking_time),
    time: formatSheetTime(booking.booking_time),
    people: booking.guest_count,
    address: sheetAddress(booking),
    name: booking.customer_name,
    tel: booking.phone,
    note: booking.note || ''
  };
}

async function markSyncSuccess(targetId) {
  await pool.query(
    `UPDATE sheet_sync_targets
     SET last_sync_at = NOW(), last_error = NULL
     WHERE id = $1`,
    [targetId]
  );
}

async function markSyncError(targetId, error) {
  await pool.query(
    `UPDATE sheet_sync_targets
     SET last_error = $1
     WHERE id = $2`,
    [String(error && error.message ? error.message : error).slice(0, 500), targetId]
  );
}

async function postSheetTarget(target, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  try {
    const response = await fetch(target.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    await markSyncSuccess(target.id);
  } catch (error) {
    await markSyncError(target.id, error);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function activeTargetsForBooking(booking) {
  const result = await pool.query(
    `SELECT sst.id, sst.name, sst.target_type, sst.webhook_url, sst.is_active,
            sst.last_sync_at, sst.last_error, sst.created_at, sst.updated_at
     FROM sheet_sync_targets sst
     WHERE sst.is_active = TRUE
      ORDER BY CASE sst.target_type WHEN 'ALL' THEN 0 ELSE 1 END, sst.id ASC`
  );

  return result.rows.map(normalizeRow);
}

function syncBookingToSheets(booking) {
  setImmediate(async () => {
    try {
      const targets = await activeTargetsForBooking(booking);
      if (!targets.length) {
        return;
      }

      const payload = bookingPayload(booking);
      await Promise.allSettled(targets.map((target) => postSheetTarget(target, payload)));
    } catch (error) {
      console.error('Sheet sync failed', error);
    }
  });
}

module.exports = {
  TARGET_TYPES,
  createSheetTarget,
  deleteSheetTarget,
  listSheetTargets,
  syncBookingToSheets,
  updateSheetTarget
};
