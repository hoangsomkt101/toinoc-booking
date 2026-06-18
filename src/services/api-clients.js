const crypto = require('crypto');
const { pool } = require('../db/pool');
const { badRequest, forbidden, notFound, conflict } = require('../domain/errors');
const { safeEqualString } = require('../domain/passwords');
const { parsePositiveInteger } = require('../domain/validators');

const API_KEY_PREFIX = 'rb_live_';
const API_KEY_BYTES = 32;

function normalizeApiClientRow(row) {
  return {
    id: Number(row.id),
    name: row.name,
    allowed_origin: row.allowed_origin,
    api_key_prefix: row.api_key_prefix,
    is_active: Boolean(row.is_active),
    last_used_at: row.last_used_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function normalizeAllowedOrigin(value) {
  const rawValue = String(value || '').trim();

  if (!rawValue) {
    throw badRequest('Domain được phép là bắt buộc');
  }

  const withScheme = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;

  let url;
  try {
    url = new URL(withScheme);
  } catch (error) {
    throw badRequest('Domain được phép phải là URL hợp lệ, ví dụ https://example.com');
  }

  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    throw badRequest('Domain được phép phải dùng http hoặc https');
  }

  if (url.username || url.password) {
    throw badRequest('Domain được phép không được chứa thông tin đăng nhập');
  }

  return url.origin;
}

function normalizeApiClientName(value) {
  const name = String(value || '').trim();

  if (!name) {
    throw badRequest('Tên cấu hình API là bắt buộc');
  }

  if (name.length > 120) {
    throw badRequest('Tên cấu hình API tối đa 120 ký tự');
  }

  return name;
}

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

function generateApiKey() {
  return `${API_KEY_PREFIX}${crypto.randomBytes(API_KEY_BYTES).toString('base64url')}`;
}

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(String(apiKey || '')).digest('base64url');
}

function apiKeyPrefix(apiKey) {
  return String(apiKey).slice(0, API_KEY_PREFIX.length + 8);
}

function validateApiKey(apiKey) {
  const key = String(apiKey || '').trim();

  if (!key) {
    throw forbidden('Thiếu API key');
  }

  if (!key.startsWith(API_KEY_PREFIX) || key.length < API_KEY_PREFIX.length + 20) {
    throw forbidden('API key không hợp lệ');
  }

  return key;
}

async function listApiClients(executor = pool) {
  const result = await executor.query(
    `SELECT id, name, allowed_origin, api_key_prefix, is_active, last_used_at, created_at, updated_at
     FROM api_clients
     ORDER BY created_at DESC, id DESC`
  );

  return result.rows.map(normalizeApiClientRow);
}

async function getApiClientById(id, executor = pool) {
  const clientId = parsePositiveInteger(id, 'id');
  const result = await executor.query(
    `SELECT id, name, allowed_origin, api_key_prefix, is_active, last_used_at, created_at, updated_at
     FROM api_clients
     WHERE id = $1`,
    [clientId]
  );

  if (result.rowCount === 0) {
    throw notFound('Không tìm thấy cấu hình API');
  }

  return normalizeApiClientRow(result.rows[0]);
}

async function ensureUniqueOrigin(origin, exceptId, executor = pool) {
  const params = [origin];
  let exceptSql = '';

  if (exceptId) {
    params.push(exceptId);
    exceptSql = `AND id <> $${params.length}`;
  }

  const result = await executor.query(
    `SELECT id FROM api_clients WHERE allowed_origin = $1 ${exceptSql}`,
    params
  );

  if (result.rowCount > 0) {
    throw conflict('Domain này đã được cấu hình API');
  }
}

async function createApiClient(input = {}) {
  const name = normalizeApiClientName(input.name);
  const allowedOrigin = normalizeAllowedOrigin(input.allowed_origin);
  const isActive = normalizeBoolean(input.is_active, 'Trạng thái hoạt động');
  const apiKey = generateApiKey();

  await ensureUniqueOrigin(allowedOrigin);

  const result = await pool.query(
    `INSERT INTO api_clients (name, allowed_origin, api_key_hash, api_key_prefix, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, allowed_origin, api_key_prefix, is_active, last_used_at, created_at, updated_at`,
    [name, allowedOrigin, hashApiKey(apiKey), apiKeyPrefix(apiKey), isActive === undefined ? true : isActive]
  );

  return {
    client: normalizeApiClientRow(result.rows[0]),
    api_key: apiKey
  };
}

async function updateApiClient(id, input = {}) {
  const clientId = parsePositiveInteger(id, 'id');
  const updates = [];
  const values = [];

  await getApiClientById(clientId);

  function setColumn(column, value) {
    values.push(value);
    updates.push(`${column} = $${values.length}`);
  }

  if (Object.prototype.hasOwnProperty.call(input, 'name')) {
    setColumn('name', normalizeApiClientName(input.name));
  }

  if (Object.prototype.hasOwnProperty.call(input, 'allowed_origin')) {
    const allowedOrigin = normalizeAllowedOrigin(input.allowed_origin);
    await ensureUniqueOrigin(allowedOrigin, clientId);
    setColumn('allowed_origin', allowedOrigin);
  }

  if (Object.prototype.hasOwnProperty.call(input, 'is_active')) {
    const isActive = normalizeBoolean(input.is_active, 'Trạng thái hoạt động');
    if (isActive === undefined) {
      throw badRequest('Trạng thái hoạt động là bắt buộc');
    }
    setColumn('is_active', isActive);
  }

  if (!updates.length) {
    throw badRequest('Chưa cung cấp thông tin API cần cập nhật');
  }

  values.push(clientId);
  const result = await pool.query(
    `UPDATE api_clients
     SET ${updates.join(', ')}
     WHERE id = $${values.length}
     RETURNING id, name, allowed_origin, api_key_prefix, is_active, last_used_at, created_at, updated_at`,
    values
  );

  return normalizeApiClientRow(result.rows[0]);
}

async function deleteApiClient(id) {
  const clientId = parsePositiveInteger(id, 'id');
  const result = await pool.query(
    `DELETE FROM api_clients
     WHERE id = $1
     RETURNING id, name, allowed_origin, api_key_prefix, is_active, last_used_at, created_at, updated_at`,
    [clientId]
  );

  if (result.rowCount === 0) {
    throw notFound('Không tìm thấy cấu hình API');
  }

  return normalizeApiClientRow(result.rows[0]);
}

async function rotateApiClientKey(id) {
  const clientId = parsePositiveInteger(id, 'id');
  const apiKey = generateApiKey();
  const result = await pool.query(
    `UPDATE api_clients
     SET api_key_hash = $1, api_key_prefix = $2
     WHERE id = $3
     RETURNING id, name, allowed_origin, api_key_prefix, is_active, last_used_at, created_at, updated_at`,
    [hashApiKey(apiKey), apiKeyPrefix(apiKey), clientId]
  );

  if (result.rowCount === 0) {
    throw notFound('Không tìm thấy cấu hình API');
  }

  return {
    client: normalizeApiClientRow(result.rows[0]),
    api_key: apiKey
  };
}

async function findActiveClientByOrigin(origin, executor = pool) {
  const allowedOrigin = normalizeAllowedOrigin(origin);
  const result = await executor.query(
    `SELECT id, name, allowed_origin, api_key_prefix, is_active, last_used_at, created_at, updated_at
     FROM api_clients
     WHERE allowed_origin = $1 AND is_active = TRUE`,
    [allowedOrigin]
  );

  if (result.rowCount === 0) {
    throw forbidden('Domain chưa được phép sử dụng public booking API');
  }

  return normalizeApiClientRow(result.rows[0]);
}

async function authenticatePublicApiClient(origin, apiKey, executor = pool) {
  const allowedOrigin = normalizeAllowedOrigin(origin);
  const key = validateApiKey(apiKey);
  const keyHash = hashApiKey(key);
  const result = await executor.query(
    `SELECT id, name, allowed_origin, api_key_prefix, is_active, last_used_at, created_at, updated_at
     FROM api_clients
     WHERE allowed_origin = $1 AND api_key_hash = $2 AND is_active = TRUE`,
    [allowedOrigin, keyHash]
  );

  if (result.rowCount === 0) {
    throw forbidden('API key không hợp lệ hoặc domain chưa được phép');
  }

  const client = normalizeApiClientRow(result.rows[0]);

  if (!safeEqualString(client.allowed_origin, allowedOrigin)) {
    throw forbidden('Domain chưa được phép sử dụng public booking API');
  }

  await executor.query('UPDATE api_clients SET last_used_at = NOW() WHERE id = $1', [client.id]);

  return client;
}

module.exports = {
  authenticatePublicApiClient,
  createApiClient,
  deleteApiClient,
  findActiveClientByOrigin,
  generateApiKey,
  getApiClientById,
  hashApiKey,
  listApiClients,
  normalizeAllowedOrigin,
  rotateApiClientKey,
  updateApiClient
};
