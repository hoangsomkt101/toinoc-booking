const { pool, withTransaction } = require('../db/pool');
const { badRequest, conflict, notFound } = require('../domain/errors');
const { parsePositiveInteger } = require('../domain/validators');

const DEFAULT_TABLE_CAPACITY = 4;
const NUMERIC_TABLE_CODE_PATTERN = /^\d+$/;

function normalizeAreaRow(row) {
  return {
    id: Number(row.id),
    branch_id: row.branch_id === undefined ? undefined : Number(row.branch_id),
    branch_name: row.branch_name,
    name: row.name,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function areaSelect() {
  return `
    SELECT
      a.id,
      a.branch_id,
      br.name AS branch_name,
      a.name,
      a.created_at,
      a.updated_at
    FROM areas a
    JOIN branches br ON br.id = a.branch_id
  `;
}

function normalizeAreaFilters(filters = {}) {
  return {
    branch_id: filters.branch_id ? parsePositiveInteger(filters.branch_id, 'branch_id') : undefined
  };
}

function normalizeBranchRow(row) {
  return {
    id: Number(row.id),
    name: row.name,
    address: row.address,
    area_count: row.area_count === undefined ? undefined : Number(row.area_count),
    table_count: row.table_count === undefined ? undefined : Number(row.table_count),
    available_table_count: row.available_table_count === undefined ? undefined : Number(row.available_table_count),
    reserved_table_count: row.reserved_table_count === undefined ? undefined : Number(row.reserved_table_count),
    occupied_table_count: row.occupied_table_count === undefined ? undefined : Number(row.occupied_table_count),
    blocked_table_count: row.blocked_table_count === undefined ? undefined : Number(row.blocked_table_count),
    has_bookings: row.has_bookings === undefined ? undefined : Boolean(row.has_bookings),
    has_users: row.has_users === undefined ? undefined : Boolean(row.has_users),
    has_staffs: row.has_staffs === undefined ? undefined : Boolean(row.has_staffs),
    areas: Array.isArray(row.areas) ? row.areas.map(normalizeAreaRow) : [],
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function normalizeAreaName(value) {
  const name = String(value || '').trim();

  if (!name) {
    throw badRequest('Tên khu vực là bắt buộc');
  }

  if (name.length > 120) {
    throw badRequest('Tên khu vực tối đa 120 ký tự');
  }

  return name;
}

function normalizeAreaPayload(input = {}) {
  return { name: normalizeAreaName((input || {}).name) };
}

function normalizeAreaUpdatePayload(input = {}) {
  if (!Object.prototype.hasOwnProperty.call(input, 'name')) {
    throw badRequest('Chưa cung cấp thông tin khu vực cần cập nhật');
  }

  return normalizeAreaPayload(input);
}

function normalizeBranchAreasPayload(input, { required = false } = {}) {
  if (input === undefined || input === null || input === '') {
    if (required) {
      throw badRequest('Danh sách khu vực là bắt buộc');
    }

    return [];
  }

  if (!Array.isArray(input)) {
    throw badRequest('Danh sách khu vực phải là một mảng');
  }

  const areas = input
    .filter((area) => area && String(area.name || '').trim())
    .map(normalizeAreaPayload);

  if (required && areas.length === 0) {
    throw badRequest('Cần có ít nhất một khu vực');
  }

  const areaNames = new Set();
  for (const area of areas) {
    const key = area.name.toLowerCase();

    if (areaNames.has(key)) {
      throw badRequest('Tên khu vực không được trùng trong cùng chi nhánh');
    }

    areaNames.add(key);
  }

  return areas;
}

function branchSelect() {
  return `
    SELECT
      b.id,
      b.name,
      b.address,
      b.table_count,
      COALESCE(area_summary.area_count, 0) AS area_count,
      COALESCE(area_summary.areas, '[]'::JSON) AS areas,
      COALESCE(table_summary.available_table_count, 0) AS available_table_count,
      COALESCE(table_summary.reserved_table_count, 0) AS reserved_table_count,
      COALESCE(table_summary.occupied_table_count, 0) AS occupied_table_count,
      COALESCE(table_summary.blocked_table_count, 0) AS blocked_table_count,
      EXISTS (SELECT 1 FROM bookings WHERE branch_id = b.id) AS has_bookings,
      EXISTS (SELECT 1 FROM users WHERE branch_id = b.id) AS has_users,
      EXISTS (SELECT 1 FROM staffs WHERE branch_id = b.id) AS has_staffs,
      b.created_at,
      b.updated_at
    FROM branches b
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::INTEGER AS area_count,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', a.id,
            'branch_id', a.branch_id,
            'branch_name', b.name,
            'name', a.name,
            'created_at', a.created_at,
            'updated_at', a.updated_at
          ) ORDER BY a.name ASC, a.id ASC
        ) AS areas
      FROM areas a
      WHERE a.branch_id = b.id
    ) area_summary ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(t.id) FILTER (WHERE t.status = 'AVAILABLE')::INTEGER AS available_table_count,
        COUNT(t.id) FILTER (WHERE t.status = 'RESERVED')::INTEGER AS reserved_table_count,
        COUNT(t.id) FILTER (WHERE t.status = 'OCCUPIED')::INTEGER AS occupied_table_count,
        COUNT(t.id) FILTER (WHERE t.status = 'BLOCKED')::INTEGER AS blocked_table_count
      FROM tables t
      WHERE t.branch_id = b.id
    ) table_summary ON TRUE
  `;
}

function normalizeBranchPayload(input = {}, { partial = false } = {}) {
  const data = {};

  if (Object.prototype.hasOwnProperty.call(input, 'name')) {
    const name = String(input.name || '').trim();

    if (!name) {
      throw badRequest('Tên chi nhánh là bắt buộc');
    }

    if (name.length > 120) {
      throw badRequest('Tên chi nhánh tối đa 120 ký tự');
    }

    data.name = name;
  } else if (!partial) {
    throw badRequest('Tên chi nhánh là bắt buộc');
  }

  if (Object.prototype.hasOwnProperty.call(input, 'address')) {
    const address = input.address === null ? '' : String(input.address || '').trim();
    data.address = address || null;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'table_count')) {
    data.table_count = parsePositiveInteger(input.table_count, 'table_count');
  } else if (!partial) {
    throw badRequest('Số bàn là bắt buộc');
  }

  return data;
}

async function listBranches(executor = pool) {
  const result = await executor.query(
    `${branchSelect()}
     ORDER BY b.name ASC, b.id ASC`
  );

  return result.rows.map(normalizeBranchRow);
}

async function listPublicBranches(executor = pool) {
  const result = await executor.query(
    `SELECT id, name, address
     FROM branches
     ORDER BY name ASC, id ASC`
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    address: row.address
  }));
}

async function getBranchById(id, executor = pool) {
  const branchId = parsePositiveInteger(id, 'id');
  const result = await executor.query(
    `${branchSelect()}
     WHERE b.id = $1`,
    [branchId]
  );

  if (result.rowCount === 0) {
    throw notFound('Không tìm thấy chi nhánh');
  }

  return normalizeBranchRow(result.rows[0]);
}

async function listAreas(filters = {}, executor = pool) {
  const normalizedFilters = normalizeAreaFilters(filters);
  const params = [];
  const where = [];

  if (normalizedFilters.branch_id) {
    params.push(normalizedFilters.branch_id);
    where.push(`a.branch_id = $${params.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await executor.query(
    `${areaSelect()}
     ${whereSql}
     ORDER BY br.name ASC, a.name ASC, a.id ASC`,
    params
  );

  return result.rows.map(normalizeAreaRow);
}

async function getAreaById(id, executor = pool) {
  const areaId = parsePositiveInteger(id, 'id');
  const result = await executor.query(
    `${areaSelect()}
     WHERE a.id = $1`,
    [areaId]
  );

  if (result.rowCount === 0) {
    throw notFound('Không tìm thấy khu vực');
  }

  return normalizeAreaRow(result.rows[0]);
}

function tableCodeForIndex(index) {
  return String(index);
}

function numericTableCode(value) {
  const tableCode = String(value || '');

  return NUMERIC_TABLE_CODE_PATTERN.test(tableCode) ? Number(tableCode) : Number.POSITIVE_INFINITY;
}

function tableOrderSql(alias = 't') {
  return `CASE WHEN ${alias}.table_code ~ '^[0-9]+$' THEN ${alias}.table_code::INTEGER END ASC NULLS LAST, ${alias}.table_code ASC, ${alias}.id ASC`;
}

async function syncBranchTables(client, branchId, tableCount) {
  const existingResult = await client.query(
    `SELECT
       t.id,
       t.table_code,
       t.status,
       EXISTS (SELECT 1 FROM booking_tables bt WHERE bt.table_id = t.id) AS has_booking_history
     FROM tables t
     WHERE t.branch_id = $1
     ORDER BY ${tableOrderSql('t')}
     FOR UPDATE`,
    [branchId]
  );
  const existingRows = existingResult.rows;
  const existingCodes = new Set(existingRows.map((row) => String(row.table_code)));

  for (let index = 1; index <= tableCount; index += 1) {
    const tableCode = tableCodeForIndex(index);

    if (existingCodes.has(tableCode)) {
      continue;
    }

    await client.query(
      `INSERT INTO tables (branch_id, table_code, capacity, status)
       VALUES ($1, $2, $3, 'AVAILABLE')`,
      [branchId, tableCode, DEFAULT_TABLE_CAPACITY]
    );
  }

  const extraRows = existingRows.filter((row) => numericTableCode(row.table_code) > tableCount);
  const protectedRows = extraRows.filter((row) => row.status !== 'AVAILABLE' || row.has_booking_history);

  if (protectedRows.length) {
    throw conflict(
      'Không thể giảm số bàn vì một số bàn cần xóa đang được sử dụng hoặc có lịch sử đặt bàn',
      protectedRows.map((row) => row.table_code)
    );
  }

  if (extraRows.length) {
    await client.query(
      'DELETE FROM tables WHERE id = ANY($1::BIGINT[])',
      [extraRows.map((row) => row.id)]
    );
  }
}

async function insertArea(client, branchId, area) {
  const result = await client.query(
    `INSERT INTO areas (branch_id, name)
     VALUES ($1, $2)
     RETURNING id`,
    [branchId, area.name]
  );

  return result.rows[0].id;
}

async function createAreaForBranch(client, branchId, input) {
  const area = normalizeAreaPayload(input);
  await getBranchById(branchId, client);

  return insertArea(client, branchId, area);
}

async function createArea(input = {}) {
  const branchId = parsePositiveInteger(input.branch_id, 'branch_id');

  try {
    return await withTransaction(async (client) => {
      const areaId = await createAreaForBranch(client, branchId, input);

      return getAreaById(areaId, client);
    });
  } catch (error) {
    if (error.code === '23505') {
      throw conflict('Tên khu vực đã tồn tại trong chi nhánh');
    }

    throw error;
  }
}

async function updateArea(id, input = {}) {
  const areaId = parsePositiveInteger(id, 'id');
  const data = normalizeAreaUpdatePayload(input);

  try {
    const result = await pool.query(
      `UPDATE areas
       SET name = $1
       WHERE id = $2
       RETURNING id`,
      [data.name, areaId]
    );

    if (result.rowCount === 0) {
      throw notFound('Không tìm thấy khu vực');
    }

    return getAreaById(result.rows[0].id);
  } catch (error) {
    if (error.code === '23505') {
      throw conflict('Tên khu vực đã tồn tại trong chi nhánh');
    }

    throw error;
  }
}

async function deleteArea(id) {
  const areaId = parsePositiveInteger(id, 'id');

  try {
    return await withTransaction(async (client) => {
      const area = await getAreaById(areaId, client);
      await client.query('DELETE FROM areas WHERE id = $1', [areaId]);

      return area;
    });
  } catch (error) {
    if (error.code === '23503') {
      throw conflict('Không thể xóa khu vực vì dữ liệu đang được sử dụng');
    }

    throw error;
  }
}

async function createBranch(input = {}) {
  const data = normalizeBranchPayload(input);
  const areas = normalizeBranchAreasPayload(input.areas);

  try {
    return await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO branches (name, address, table_count)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [data.name, data.address || null, data.table_count]
      );
      const branchId = result.rows[0].id;

      await syncBranchTables(client, branchId, data.table_count);

      for (const area of areas) {
        await insertArea(client, branchId, area);
      }

      return getBranchById(branchId, client);
    });
  } catch (error) {
    if (error.code === '23505') {
      throw conflict('Tên chi nhánh đã tồn tại');
    }

    throw error;
  }
}

async function createBranchArea(id, input = {}) {
  const branchId = parsePositiveInteger(id, 'id');

  try {
    return await withTransaction(async (client) => {
      await createAreaForBranch(client, branchId, input);

      return getBranchById(branchId, client);
    });
  } catch (error) {
    if (error.code === '23505') {
      throw conflict('Tên khu vực đã tồn tại trong chi nhánh');
    }

    throw error;
  }
}

async function updateBranch(id, input = {}) {
  const branchId = parsePositiveInteger(id, 'id');
  const data = normalizeBranchPayload(input, { partial: true });
  const updates = [];
  const values = [];

  for (const column of ['name', 'address', 'table_count']) {
    if (Object.prototype.hasOwnProperty.call(data, column)) {
      values.push(data[column]);
      updates.push(`${column} = $${values.length}`);
    }
  }

  if (updates.length === 0) {
    throw badRequest('Chưa cung cấp thông tin chi nhánh cần cập nhật');
  }

  values.push(branchId);

  try {
    return await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE branches
         SET ${updates.join(', ')}
         WHERE id = $${values.length}
         RETURNING id`,
        values
      );

      if (result.rowCount === 0) {
        throw notFound('Không tìm thấy chi nhánh');
      }

      if (Object.prototype.hasOwnProperty.call(data, 'table_count')) {
        await syncBranchTables(client, branchId, data.table_count);
      }

      return getBranchById(result.rows[0].id, client);
    });
  } catch (error) {
    if (error.code === '23505') {
      throw conflict('Tên chi nhánh đã tồn tại');
    }

    throw error;
  }
}

async function deleteBranch(id) {
  const branchId = parsePositiveInteger(id, 'id');

  return withTransaction(async (client) => {
    const branchResult = await client.query(
      'SELECT id FROM branches WHERE id = $1 FOR UPDATE',
      [branchId]
    );

    if (branchResult.rowCount === 0) {
      throw notFound('Không tìm thấy chi nhánh');
    }

    const usageResult = await client.query(
      `SELECT
         EXISTS (SELECT 1 FROM bookings WHERE branch_id = $1) AS has_bookings,
         EXISTS (SELECT 1 FROM users WHERE branch_id = $1) AS has_users,
         EXISTS (SELECT 1 FROM staffs WHERE branch_id = $1) AS has_staffs`,
      [branchId]
    );
    const usage = usageResult.rows[0];

    if (usage.has_bookings) {
      throw conflict('Không thể xóa chi nhánh có lịch sử đặt bàn');
    }

    if (usage.has_users || usage.has_staffs) {
      throw conflict('Không thể xóa chi nhánh đang có tài khoản hoặc nhân viên');
    }

    const branch = await getBranchById(branchId, client);
    await client.query('DELETE FROM tables WHERE branch_id = $1', [branchId]);
    await client.query('DELETE FROM areas WHERE branch_id = $1', [branchId]);
    await client.query('DELETE FROM branches WHERE id = $1', [branchId]);

    return branch;
  });
}

module.exports = {
  createArea,
  createBranchArea,
  createBranch,
  deleteArea,
  deleteBranch,
  getAreaById,
  getBranchById,
  listAreas,
  listBranches,
  listPublicBranches,
  normalizeBranchAreasPayload,
  normalizeAreaUpdatePayload,
  normalizeBranchRow,
  updateArea,
  updateBranch
};
