const { pool, withTransaction } = require('../db/pool');
const { badRequest, conflict, notFound } = require('../domain/errors');
const { normalizePhone, parsePositiveInteger } = require('../domain/validators');

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function normalizeCustomerName(value) {
  const customerName = String(value || '').trim();

  if (!customerName) {
    throw badRequest('Tên khách hàng là bắt buộc');
  }

  return customerName;
}

function normalizeCustomerRow(row) {
  return {
    id: Number(row.id),
    customer_name: row.customer_name,
    phone: row.phone,
    booking_count: row.booking_count === undefined ? undefined : Number(row.booking_count || 0),
    completed_booking_count: row.completed_booking_count === undefined ? undefined : Number(row.completed_booking_count || 0),
    cancelled_booking_count: row.cancelled_booking_count === undefined ? undefined : Number(row.cancelled_booking_count || 0),
    no_show_booking_count: row.no_show_booking_count === undefined ? undefined : Number(row.no_show_booking_count || 0),
    last_booking_id: row.last_booking_id === null || row.last_booking_id === undefined ? null : Number(row.last_booking_id),
    last_booking_time: row.last_booking_time || null,
    last_booking_status: row.last_booking_status || null,
    last_booking_branch_id: row.last_booking_branch_id === null || row.last_booking_branch_id === undefined ? null : Number(row.last_booking_branch_id),
    last_booking_branch_name: row.last_booking_branch_name || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function normalizeBookingTableRow(row) {
  return {
    ...row,
    id: Number(row.id),
    capacity: Number(row.capacity)
  };
}

function normalizeCustomerBookingRow(row) {
  return {
    ...row,
    id: Number(row.id),
    customer_id: row.customer_id === null ? null : Number(row.customer_id),
    branch_id: Number(row.branch_id),
    area_id: row.area_id === null || row.area_id === undefined ? null : Number(row.area_id),
    guest_count: Number(row.guest_count),
    actual_guest_count: row.actual_guest_count === null ? null : Number(row.actual_guest_count),
    assigned_tables: Array.isArray(row.assigned_tables) ? row.assigned_tables.map(normalizeBookingTableRow) : []
  };
}

function customerStatsSelect(branchSql = '') {
  return `
    SELECT
      c.id,
      c.customer_name,
      c.phone,
      COALESCE(stats.booking_count, 0) AS booking_count,
      COALESCE(stats.completed_booking_count, 0) AS completed_booking_count,
      COALESCE(stats.cancelled_booking_count, 0) AS cancelled_booking_count,
      COALESCE(stats.no_show_booking_count, 0) AS no_show_booking_count,
      latest.last_booking_id,
      latest.last_booking_time,
      latest.last_booking_status,
      latest.last_booking_branch_id,
      latest.last_booking_branch_name,
      c.created_at,
      c.updated_at
    FROM customers c
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::INTEGER AS booking_count,
        COUNT(*) FILTER (WHERE b.status = 'COMPLETED')::INTEGER AS completed_booking_count,
        COUNT(*) FILTER (WHERE b.status = 'CANCELLED')::INTEGER AS cancelled_booking_count,
        COUNT(*) FILTER (WHERE b.status = 'NO_SHOW')::INTEGER AS no_show_booking_count
      FROM bookings b
      WHERE (b.customer_id = c.id OR b.phone = c.phone)
    ) stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        b.id AS last_booking_id,
        b.booking_time AS last_booking_time,
        b.status AS last_booking_status,
        br.id AS last_booking_branch_id,
        br.name AS last_booking_branch_name
      FROM bookings b
      JOIN branches br ON br.id = b.branch_id
      WHERE (b.customer_id = c.id OR b.phone = c.phone)
        AND b.status = 'COMPLETED'
      ${branchSql}
      ORDER BY b.booking_time DESC, b.id DESC
      LIMIT 1
    ) latest ON TRUE
  `;
}

function customerBookingSelect() {
  return `
    SELECT
      b.id,
      b.customer_id,
      b.branch_id,
      b.area_id,
      br.name AS branch_name,
      br.address AS branch_address,
      ar.name AS area_name,
      b.customer_name,
      b.phone,
      b.booking_time,
      b.guest_count,
      b.order_staff_name,
      b.note,
      b.status,
      b.actual_guest_count,
      b.check_in_at,
      b.check_out_at,
      b.created_at,
      b.updated_at,
      COALESCE(assigned_tables.assigned_tables, '[]'::JSON) AS assigned_tables
    FROM bookings b
    JOIN branches br ON br.id = b.branch_id
    LEFT JOIN areas ar ON ar.id = b.area_id
    LEFT JOIN LATERAL (
      SELECT JSON_AGG(
        JSON_BUILD_OBJECT(
          'id', t.id,
          'table_code', t.table_code,
          'capacity', t.capacity,
          'status', t.status,
          'assigned_at', bt.assigned_at
        ) ORDER BY CASE WHEN t.table_code ~ '^[0-9]+$' THEN t.table_code::INTEGER END ASC NULLS LAST, t.table_code ASC, t.id ASC
      ) AS assigned_tables
      FROM booking_tables bt
      JOIN tables t ON t.id = bt.table_id
      WHERE bt.booking_id = b.id
    ) assigned_tables ON TRUE
  `;
}

function normalizeCustomerFilters(filters = {}) {
  return {
    branch_id: filters.branch_id ? parsePositiveInteger(filters.branch_id, 'branch_id') : undefined,
    q: String(filters.q || '').trim()
  };
}

function normalizeLimit(value, fallback = 50) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const limit = Number.parseInt(value, 10);

  if (!Number.isInteger(limit) || limit <= 0) {
    throw badRequest('Giới hạn kết quả phải là số nguyên dương');
  }

  return Math.min(limit, 100);
}

function appendSearchWhere(where, params, query) {
  if (!query) {
    return;
  }

  params.push(`%${query}%`);
  const nameParam = params.length;
  const digits = query.replace(/\D/g, '');

  if (digits) {
    params.push(`%${normalizePhone(query)}%`);
  } else {
    params.push(`%${query}%`);
  }

  const phoneParam = params.length;
  where.push(`(c.customer_name ILIKE $${nameParam} OR c.phone LIKE $${phoneParam})`);
}

function appendBranchScope(where, params, branchId) {
  if (!branchId) {
    return '';
  }

  params.push(branchId);
  const branchParam = params.length;
  where.push(`EXISTS (
    SELECT 1
    FROM bookings b
    WHERE (b.customer_id = c.id OR b.phone = c.phone)
      AND b.branch_id = $${branchParam}
  )`);

  return `AND b.branch_id = $${branchParam}`;
}

function appendPhonePrefixWhere(where, params, phoneValue) {
  const phone = normalizePhone(phoneValue);

  if (phone.length < 2) {
    throw badRequest('Nhập ít nhất 2 chữ số để gợi ý khách hàng');
  }

  params.push(`${phone}%`);
  where.push(`c.phone LIKE $${params.length}`);
}

async function upsertCustomerByPhone(client, input) {
  const customerName = normalizeCustomerName(input.customer_name);
  const phone = normalizePhone(input.phone);
  const result = await client.query(
    `INSERT INTO customers (customer_name, phone)
     VALUES ($1, $2)
     ON CONFLICT (phone)
     DO UPDATE SET customer_name = EXCLUDED.customer_name
     RETURNING id`,
    [customerName, phone]
  );

  return Number(result.rows[0].id);
}

async function listCustomers(filters = {}, executor = pool) {
  const normalizedFilters = normalizeCustomerFilters(filters);
  const params = [];
  const where = [];
  const branchSql = appendBranchScope(where, params, normalizedFilters.branch_id);

  appendSearchWhere(where, params, normalizedFilters.q);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await executor.query(
    `${customerStatsSelect(branchSql)}
     ${whereSql}
     ORDER BY latest.last_booking_time DESC NULLS LAST, c.updated_at DESC, c.id DESC
     LIMIT 200`,
    params
  );

  return result.rows.map(normalizeCustomerRow);
}

async function suggestCustomersByPhone(phoneValue, filters = {}, executor = pool) {
  const normalizedFilters = normalizeCustomerFilters(filters);
  const params = [];
  const where = [];
  const branchSql = appendBranchScope(where, params, normalizedFilters.branch_id);

  appendPhonePrefixWhere(where, params, phoneValue);

  const result = await executor.query(
    `${customerStatsSelect(branchSql)}
     WHERE ${where.join(' AND ')}
     ORDER BY latest.last_booking_time DESC NULLS LAST, c.updated_at DESC, c.id DESC
     LIMIT 8`,
    params
  );

  return result.rows.map(normalizeCustomerRow);
}

async function getCustomerById(id, filters = {}, executor = pool) {
  const customerId = parsePositiveInteger(id, 'id');
  const normalizedFilters = normalizeCustomerFilters(filters);
  const params = [customerId];
  const where = ['c.id = $1'];
  let branchSql = '';

  if (normalizedFilters.branch_id) {
    params.push(normalizedFilters.branch_id);
    branchSql = `AND b.branch_id = $${params.length}`;
    where.push(`EXISTS (
      SELECT 1
      FROM bookings b
      WHERE (b.customer_id = c.id OR b.phone = c.phone)
        AND b.branch_id = $${params.length}
    )`);
  }

  const result = await executor.query(
    `${customerStatsSelect(branchSql)}
     WHERE ${where.join(' AND ')}`,
    params
  );

  if (result.rowCount === 0) {
    throw notFound('Không tìm thấy khách hàng');
  }

  return normalizeCustomerRow(result.rows[0]);
}

async function getCustomerByPhone(phoneValue, filters = {}, executor = pool) {
  const phone = normalizePhone(phoneValue);
  const normalizedFilters = normalizeCustomerFilters(filters);
  const params = [phone];
  let branchSql = '';

  if (normalizedFilters.branch_id) {
    params.push(normalizedFilters.branch_id);
    branchSql = `AND b.branch_id = $${params.length}`;
  }

  const result = await executor.query(
    `${customerStatsSelect(branchSql)}
     WHERE c.phone = $1`,
    params
  );

  return result.rowCount === 0 ? null : normalizeCustomerRow(result.rows[0]);
}

async function listCustomerBookings(id, filters = {}, executor = pool) {
  const branchId = filters.branch_id ? parsePositiveInteger(filters.branch_id, 'branch_id') : undefined;
  const customer = await getCustomerById(id, branchId ? { branch_id: branchId } : {}, executor);
  const limit = normalizeLimit(filters.limit, 50);
  const params = [customer.id, customer.phone];
  const where = ['(b.customer_id = $1 OR b.phone = $2)'];

  if (branchId) {
    params.push(branchId);
    where.push(`b.branch_id = $${params.length}`);
  }

  params.push(limit);
  const result = await executor.query(
    `${customerBookingSelect()}
     WHERE ${where.join(' AND ')}
     ORDER BY b.booking_time DESC, b.id DESC
     LIMIT $${params.length}`,
    params
  );

  return result.rows.map(normalizeCustomerBookingRow);
}

async function lookupCustomerByPhone(phoneValue, filters = {}, executor = pool) {
  const customer = await getCustomerByPhone(phoneValue, filters, executor);

  if (!customer) {
    return { customer: null, recent_bookings: [] };
  }

  const recentBookings = customer.booking_count > 0
    ? await listCustomerBookings(customer.id, { ...filters, limit: 5 }, executor)
    : [];

  return {
    customer,
    recent_bookings: recentBookings
  };
}

async function updateCustomer(id, input = {}, filters = {}) {
  const customerId = parsePositiveInteger(id, 'id');
  const updates = [];
  const values = [];

  function setColumn(column, value) {
    values.push(value);
    updates.push(`${column} = $${values.length}`);
  }

  if (hasOwn(input, 'customer_name')) {
    setColumn('customer_name', normalizeCustomerName(input.customer_name));
  }

  if (hasOwn(input, 'phone')) {
    setColumn('phone', normalizePhone(input.phone));
  }

  if (updates.length === 0) {
    throw badRequest('Chưa cung cấp thông tin khách hàng cần cập nhật');
  }

  return withTransaction(async (client) => {
    await getCustomerById(customerId, filters, client);
    values.push(customerId);

    try {
      await client.query(`UPDATE customers SET ${updates.join(', ')} WHERE id = $${values.length}`, values);
    } catch (error) {
      if (error.code === '23505') {
        throw conflict('Số điện thoại đã thuộc về khách hàng khác');
      }

      throw error;
    }

    return getCustomerById(customerId, {}, client);
  });
}

module.exports = {
  getCustomerById,
  getCustomerByPhone,
  listCustomerBookings,
  listCustomers,
  lookupCustomerByPhone,
  suggestCustomersByPhone,
  updateCustomer,
  upsertCustomerByPhone
};
