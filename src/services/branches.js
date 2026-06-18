const { pool, withTransaction } = require('../db/pool');
const { badRequest, conflict, notFound } = require('../domain/errors');
const { parsePositiveInteger } = require('../domain/validators');

const DEFAULT_TABLE_CAPACITY = 4;

function normalizeTableRow(row) {
  return {
    id: Number(row.id),
    branch_id: row.branch_id === undefined ? undefined : Number(row.branch_id),
    area_id: row.area_id === undefined ? undefined : Number(row.area_id),
    table_code: row.table_code,
    capacity: Number(row.capacity),
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function normalizeAreaRow(row) {
  return {
    id: Number(row.id),
    branch_id: row.branch_id === undefined ? undefined : Number(row.branch_id),
    branch_name: row.branch_name,
    name: row.name,
    table_count: Number(row.table_count || 0),
    available_table_count: Number(row.available_table_count || 0),
    reserved_table_count: Number(row.reserved_table_count || 0),
    occupied_table_count: Number(row.occupied_table_count || 0),
    blocked_table_count: Number(row.blocked_table_count || 0),
    tables: Array.isArray(row.tables) ? row.tables.map(normalizeTableRow) : [],
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
      COUNT(t.id)::INTEGER AS table_count,
      COUNT(t.id) FILTER (WHERE t.status = 'AVAILABLE')::INTEGER AS available_table_count,
      COUNT(t.id) FILTER (WHERE t.status = 'RESERVED')::INTEGER AS reserved_table_count,
      COUNT(t.id) FILTER (WHERE t.status = 'OCCUPIED')::INTEGER AS occupied_table_count,
      COUNT(t.id) FILTER (WHERE t.status = 'BLOCKED')::INTEGER AS blocked_table_count,
      COALESCE(
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', t.id,
            'branch_id', t.branch_id,
            'area_id', t.area_id,
            'table_code', t.table_code,
            'capacity', t.capacity,
            'status', t.status,
            'created_at', t.created_at,
            'updated_at', t.updated_at
          ) ORDER BY t.table_code ASC, t.id ASC
        ) FILTER (WHERE t.id IS NOT NULL),
        '[]'::JSON
      ) AS tables,
      a.created_at,
      a.updated_at
    FROM areas a
    JOIN branches br ON br.id = a.branch_id
    LEFT JOIN tables t ON t.area_id = a.id AND t.branch_id = a.branch_id
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
    has_bookings: row.has_bookings === undefined ? undefined : Boolean(row.has_bookings),
    has_users: row.has_users === undefined ? undefined : Boolean(row.has_users),
    has_staffs: row.has_staffs === undefined ? undefined : Boolean(row.has_staffs),
    areas: Array.isArray(row.areas) ? row.areas.map(normalizeAreaRow) : [],
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function defaultTablePrefix(name) {
  const prefix = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .replace(/[^a-z0-9]+/gi, '')
    .toUpperCase();

  return prefix || 'AREA';
}

function normalizeTablePrefix(value, areaName) {
  const rawPrefix = value === undefined || value === null || value === '' ? defaultTablePrefix(areaName) : String(value).trim();
  const prefix = defaultTablePrefix(rawPrefix);

  if (prefix.length > 24) {
    throw badRequest('Tiền tố mã bàn tối đa 24 ký tự sau khi chuẩn hóa');
  }

  return prefix;
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
  const payload = input || {};
  const name = normalizeAreaName(payload.name);

  return {
    name,
    table_count: parsePositiveInteger(payload.table_count, 'table_count'),
    capacity: payload.capacity === undefined || payload.capacity === null || payload.capacity === ''
      ? DEFAULT_TABLE_CAPACITY
      : parsePositiveInteger(payload.capacity, 'capacity'),
    table_prefix: normalizeTablePrefix(payload.table_prefix, name)
  };
}

function normalizeAreaUpdatePayload(input = {}) {
  if (!Object.prototype.hasOwnProperty.call(input, 'name')) {
    throw badRequest('Chưa cung cấp thông tin khu vực cần cập nhật');
  }

  return { name: normalizeAreaName(input.name) };
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

  const areas = input.map(normalizeAreaPayload);

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
      COALESCE(area_summary.area_count, 0) AS area_count,
      COALESCE(area_summary.table_count, 0) AS table_count,
      COALESCE(area_summary.areas, '[]'::JSON) AS areas,
      EXISTS (SELECT 1 FROM bookings WHERE branch_id = b.id) AS has_bookings,
      EXISTS (SELECT 1 FROM users WHERE branch_id = b.id) AS has_users,
      EXISTS (SELECT 1 FROM staffs WHERE branch_id = b.id) AS has_staffs,
      b.created_at,
      b.updated_at
    FROM branches b
    LEFT JOIN LATERAL (
      SELECT
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', area_rows.id,
            'name', area_rows.name,
            'table_count', area_rows.table_count,
            'available_table_count', area_rows.available_table_count,
            'reserved_table_count', area_rows.reserved_table_count,
            'occupied_table_count', area_rows.occupied_table_count,
            'blocked_table_count', area_rows.blocked_table_count,
            'tables', area_rows.tables,
            'created_at', area_rows.created_at,
            'updated_at', area_rows.updated_at
          ) ORDER BY area_rows.name ASC, area_rows.id ASC
        ) AS areas,
        COUNT(*) AS area_count,
        COALESCE(SUM(area_rows.table_count), 0) AS table_count
      FROM (
        SELECT
          a.id,
          a.name,
          a.created_at,
          a.updated_at,
          COUNT(t.id)::INTEGER AS table_count,
          COUNT(t.id) FILTER (WHERE t.status = 'AVAILABLE')::INTEGER AS available_table_count,
          COUNT(t.id) FILTER (WHERE t.status = 'RESERVED')::INTEGER AS reserved_table_count,
          COUNT(t.id) FILTER (WHERE t.status = 'OCCUPIED')::INTEGER AS occupied_table_count,
          COUNT(t.id) FILTER (WHERE t.status = 'BLOCKED')::INTEGER AS blocked_table_count,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'id', t.id,
                'branch_id', t.branch_id,
                'area_id', t.area_id,
                'table_code', t.table_code,
                'capacity', t.capacity,
                'status', t.status,
                'created_at', t.created_at,
                'updated_at', t.updated_at
              ) ORDER BY t.table_code ASC, t.id ASC
            ) FILTER (WHERE t.id IS NOT NULL),
            '[]'::JSON
          ) AS tables
        FROM areas a
        LEFT JOIN tables t ON t.area_id = a.id AND t.branch_id = a.branch_id
        WHERE a.branch_id = b.id
        GROUP BY a.id
      ) area_rows
    ) area_summary ON TRUE
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
     GROUP BY a.id, br.name
     ORDER BY br.name ASC, a.name ASC, a.id ASC`,
    params
  );

  return result.rows.map(normalizeAreaRow);
}

async function getAreaById(id, executor = pool) {
  const areaId = parsePositiveInteger(id, 'id');
  const result = await executor.query(
    `${areaSelect()}
     WHERE a.id = $1
     GROUP BY a.id, br.name`,
    [areaId]
  );

  if (result.rowCount === 0) {
    throw notFound('Không tìm thấy khu vực');
  }

  return normalizeAreaRow(result.rows[0]);
}

function buildTableCodes(prefix, tableCount, usedTableCodes) {
  let suffix = 1;

  while (suffix < 1000) {
    const effectivePrefix = suffix === 1 ? prefix : `${prefix}${suffix}`;
    const tableCodes = Array.from({ length: tableCount }, (_, index) =>
      `${effectivePrefix}-${String(index + 1).padStart(2, '0')}`
    );

    if (tableCodes.every((tableCode) => !usedTableCodes.has(tableCode))) {
      for (const tableCode of tableCodes) {
        usedTableCodes.add(tableCode);
      }

      return tableCodes;
    }

    suffix += 1;
  }

  throw conflict('Không thể tạo mã bàn duy nhất cho khu vực');
}

async function getUsedTableCodes(client, branchId) {
  const result = await client.query('SELECT table_code FROM tables WHERE branch_id = $1', [branchId]);

  return new Set(result.rows.map((row) => row.table_code));
}

async function insertAreaWithTables(client, branchId, area, usedTableCodes) {
  const areaResult = await client.query(
    `INSERT INTO areas (branch_id, name)
     VALUES ($1, $2)
     RETURNING id`,
    [branchId, area.name]
  );
  const areaId = areaResult.rows[0].id;
  const tableCodes = buildTableCodes(area.table_prefix, area.table_count, usedTableCodes);

  for (const tableCode of tableCodes) {
    await client.query(
      `INSERT INTO tables (branch_id, area_id, table_code, capacity, status)
       VALUES ($1, $2, $3, $4, 'AVAILABLE')`,
      [branchId, areaId, tableCode, area.capacity]
    );
  }

  return areaId;
}

async function createAreaForBranch(client, branchId, input) {
  const area = normalizeAreaPayload(input);
  await getBranchById(branchId, client);
  const usedTableCodes = await getUsedTableCodes(client, branchId);

  return insertAreaWithTables(client, branchId, area, usedTableCodes);
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
      const areaResult = await client.query(
        `SELECT id, branch_id
         FROM areas
         WHERE id = $1
         FOR UPDATE`,
        [areaId]
      );

      if (areaResult.rowCount === 0) {
        throw notFound('Không tìm thấy khu vực');
      }

      const branchId = areaResult.rows[0].branch_id;
      await client.query('SELECT id FROM branches WHERE id = $1 FOR UPDATE', [branchId]);

      const areaCountResult = await client.query(
        'SELECT COUNT(*)::INTEGER AS count FROM areas WHERE branch_id = $1',
        [branchId]
      );

      if (areaCountResult.rows[0].count <= 1) {
        throw conflict('Không thể xóa khu vực cuối cùng của chi nhánh');
      }

      const usageResult = await client.query(
        `SELECT
           EXISTS (
             SELECT 1
             FROM booking_tables bt
             JOIN tables t ON t.id = bt.table_id
             WHERE t.area_id = $1
           ) AS has_booking_history,
           EXISTS (
             SELECT 1
             FROM tables
             WHERE area_id = $1 AND status IN ('RESERVED', 'OCCUPIED')
           ) AS has_active_tables`,
        [areaId]
      );

      if (usageResult.rows[0].has_active_tables) {
        throw conflict('Không thể xóa khu vực đang có bàn được đặt hoặc đang sử dụng');
      }

      if (usageResult.rows[0].has_booking_history) {
        throw conflict('Không thể xóa khu vực có lịch sử đặt bàn');
      }

      const area = await getAreaById(areaId, client);
      await client.query('DELETE FROM tables WHERE area_id = $1', [areaId]);
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
  const areas = normalizeBranchAreasPayload(input.areas, { required: true });

  try {
    return await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO branches (name, address)
         VALUES ($1, $2)
         RETURNING id`,
        [data.name, data.address || null]
      );
      const branchId = result.rows[0].id;
      const usedTableCodes = new Set();

      for (const area of areas) {
        await insertAreaWithTables(client, branchId, area, usedTableCodes);
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

  for (const column of ['name', 'address']) {
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
    const result = await pool.query(
      `UPDATE branches
       SET ${updates.join(', ')}
       WHERE id = $${values.length}
       RETURNING id`,
      values
    );

    if (result.rowCount === 0) {
      throw notFound('Không tìm thấy chi nhánh');
    }

    return getBranchById(result.rows[0].id);
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
