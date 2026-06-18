const { pool, withTransaction } = require('../db/pool');
const { ACTIVE_ASSIGNMENT_STATUSES, BOOKING_STATUSES, TABLE_STATUSES } = require('../domain/constants');
const { badRequest, conflict, notFound } = require('../domain/errors');
const {
  normalizeTableIds,
  parseOptionalDate,
  parseOptionalPositiveInteger,
  parsePositiveInteger,
  validateBookingPayload,
  validateBookingStatus,
  validateTableStatus
} = require('../domain/validators');

const INACTIVE_RELEASE_STATUSES = ['CANCELLED', 'NO_SHOW', 'CHECKED_OUT', 'COMPLETED'];
const BOOKING_STATUS_LABELS = Object.freeze({
  PENDING: 'chờ xác nhận',
  CONFIRMED: 'đã xác nhận',
  CANCELLED: 'đã hủy',
  NO_SHOW: 'khách không đến',
  CHECKED_IN: 'đã nhận bàn',
  CHECKED_OUT: 'đã trả bàn',
  COMPLETED: 'hoàn tất'
});

function bookingStatusLabel(status) {
  return BOOKING_STATUS_LABELS[status] || status;
}

function bookingSelect(includeLogs = false) {
  return `
    SELECT
      b.id,
      b.customer_id,
      b.branch_id,
      br.name AS branch_name,
      b.customer_name,
      b.phone,
      b.booking_time,
      b.guest_count,
      b.note,
      b.status,
      b.actual_guest_count,
      b.check_in_at,
      b.check_out_at,
      b.created_at,
      b.updated_at,
      COALESCE(assigned_tables.assigned_tables, '[]'::JSON) AS assigned_tables
      ${includeLogs ? ", COALESCE(status_logs.status_logs, '[]'::JSON) AS status_logs" : ''}
    FROM bookings b
    JOIN branches br ON br.id = b.branch_id
    LEFT JOIN LATERAL (
      SELECT JSON_AGG(
        JSON_BUILD_OBJECT(
          'id', t.id,
          'table_code', t.table_code,
          'capacity', t.capacity,
          'status', t.status,
          'area_id', a.id,
          'area_name', a.name,
          'assigned_at', bt.assigned_at
        ) ORDER BY a.name, t.table_code
      ) AS assigned_tables
      FROM booking_tables bt
      JOIN tables t ON t.id = bt.table_id
      JOIN areas a ON a.id = t.area_id
      WHERE bt.booking_id = b.id
    ) assigned_tables ON TRUE
    ${
      includeLogs
        ? `LEFT JOIN LATERAL (
      SELECT JSON_AGG(
        JSON_BUILD_OBJECT(
          'id', bsl.id,
          'from_status', bsl.from_status,
          'to_status', bsl.to_status,
          'note', bsl.note,
          'changed_by_staff_id', bsl.changed_by_staff_id,
          'created_at', bsl.created_at
        ) ORDER BY bsl.created_at DESC
      ) AS status_logs
      FROM booking_status_logs bsl
      WHERE bsl.booking_id = b.id
    ) status_logs ON TRUE`
        : ''
    }
  `;
}

function normalizeTableRow(row) {
  return {
    ...row,
    id: Number(row.id),
    branch_id: row.branch_id === undefined ? undefined : Number(row.branch_id),
    area_id: row.area_id === null || row.area_id === undefined ? null : Number(row.area_id),
    capacity: Number(row.capacity)
  };
}

function normalizeBookingRow(row) {
  return {
    ...row,
    id: Number(row.id),
    customer_id: row.customer_id === null ? null : Number(row.customer_id),
    branch_id: Number(row.branch_id),
    guest_count: Number(row.guest_count),
    actual_guest_count: row.actual_guest_count === null ? null : Number(row.actual_guest_count),
    assigned_tables: Array.isArray(row.assigned_tables) ? row.assigned_tables.map(normalizeTableRow) : [],
    status_logs: Array.isArray(row.status_logs) ? row.status_logs.map((log) => ({ ...log, id: Number(log.id) })) : undefined
  };
}

function dashboardFilters(query = {}) {
  return {
    branch_id: query.branch_id ? parsePositiveInteger(query.branch_id, 'branch_id') : undefined
  };
}

async function ensureBranch(client, branchId) {
  const result = await client.query('SELECT id FROM branches WHERE id = $1', [branchId]);

  if (result.rowCount === 0) {
    throw badRequest('Chi nhánh không tồn tại');
  }
}

async function upsertCustomer(client, data) {
  const result = await client.query(
    `INSERT INTO customers (customer_name, phone)
     VALUES ($1, $2)
     ON CONFLICT (phone)
     DO UPDATE SET customer_name = EXCLUDED.customer_name
     RETURNING id`,
    [data.customer_name, data.phone]
  );

  return result.rows[0].id;
}

async function logStatusChange(client, bookingId, fromStatus, toStatus, note, staffId) {
  if (fromStatus === toStatus) {
    return;
  }

  await client.query(
    `INSERT INTO booking_status_logs (booking_id, from_status, to_status, note, changed_by_staff_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [bookingId, fromStatus, toStatus, note || null, staffId || null]
  );
}

async function lockBooking(client, id) {
  const bookingId = parsePositiveInteger(id, 'id');
  const result = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [bookingId]);

  if (result.rowCount === 0) {
    throw notFound('Không tìm thấy yêu cầu đặt bàn');
  }

  return result.rows[0];
}

async function getBookingById(id, executor = pool) {
  const bookingId = parsePositiveInteger(id, 'id');
  const result = await executor.query(`${bookingSelect(true)} WHERE b.id = $1`, [bookingId]);

  if (result.rowCount === 0) {
    throw notFound('Không tìm thấy yêu cầu đặt bàn');
  }

  return normalizeBookingRow(result.rows[0]);
}

async function listBookings(filters = {}, executor = pool) {
  const params = [];
  const where = [];

  if (filters.branch_id) {
    params.push(parsePositiveInteger(filters.branch_id, 'branch_id'));
    where.push(`b.branch_id = $${params.length}`);
  }

  if (filters.status) {
    const statuses = String(filters.status)
      .split(',')
      .map((status) => validateBookingStatus(status.trim()))
      .filter(Boolean);

    params.push(statuses);
    where.push(`b.status = ANY($${params.length}::TEXT[])`);
  }

  if (filters.period === 'today') {
    where.push("b.booking_time >= DATE_TRUNC('day', NOW())");
    where.push("b.booking_time < DATE_TRUNC('day', NOW()) + INTERVAL '1 day'");
  }

  if (filters.period === 'upcoming') {
    where.push("b.booking_time >= DATE_TRUNC('day', NOW()) + INTERVAL '1 day'");
    where.push("b.status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')");
  }

  if (filters.period === 'waiting') {
    where.push("b.status = 'PENDING'");
  }

  if (filters.period === 'active') {
    where.push("b.status IN ('CONFIRMED', 'CHECKED_IN')");
  }

  if (filters.period === 'open') {
    where.push("b.status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT')");
  }

  if (filters.period === 'closed') {
    where.push("b.status IN ('COMPLETED', 'CANCELLED', 'NO_SHOW')");
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = filters.period === 'closed'
    ? 'ORDER BY b.updated_at DESC, b.id DESC'
    : 'ORDER BY b.booking_time ASC, b.id ASC';
  const result = await executor.query(
    `${bookingSelect(false)} ${whereSql} ${orderSql} LIMIT 200`,
    params
  );

  return result.rows.map(normalizeBookingRow);
}

async function listTables(filters = {}, executor = pool) {
  const params = [];
  const where = [];

  if (filters.branch_id) {
    params.push(parsePositiveInteger(filters.branch_id, 'branch_id'));
    where.push(`t.branch_id = $${params.length}`);
  }

  if (filters.status) {
    const statuses = String(filters.status)
      .split(',')
      .map((status) => validateTableStatus(status.trim()))
      .filter(Boolean);

    params.push(statuses);
    where.push(`t.status = ANY($${params.length}::TEXT[])`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await executor.query(
    `SELECT
       t.id,
       t.branch_id,
       br.name AS branch_name,
       t.area_id,
       a.name AS area_name,
       t.table_code,
       t.capacity,
       t.status,
       t.created_at,
       t.updated_at
     FROM tables t
     JOIN branches br ON br.id = t.branch_id
     JOIN areas a ON a.id = t.area_id
     ${whereSql}
     ORDER BY a.name ASC, t.table_code ASC`,
    params
  );

  return result.rows.map(normalizeTableRow);
}

async function createBooking(input) {
  const data = validateBookingPayload(input);

  return withTransaction(async (client) => {
    await ensureBranch(client, data.branch_id);
    const customerId = await upsertCustomer(client, data);
    const bookingResult = await client.query(
      `INSERT INTO bookings (customer_id, branch_id, customer_name, phone, booking_time, guest_count, note, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
       RETURNING id`,
      [customerId, data.branch_id, data.customer_name, data.phone, data.booking_time, data.guest_count, data.note || null]
    );

    await logStatusChange(client, bookingResult.rows[0].id, null, 'PENDING', 'Đã tạo yêu cầu đặt bàn');

    return getBookingById(bookingResult.rows[0].id, client);
  });
}

async function updateBooking(id, input = {}) {
  const data = validateBookingPayload(input, { partial: true });
  const hasStatus = Object.prototype.hasOwnProperty.call(input, 'status');
  const nextStatus = hasStatus ? validateBookingStatus(input.status) : undefined;

  if (Object.keys(data).length === 0 && !hasStatus) {
    throw badRequest('Chưa cung cấp thông tin đặt bàn cần cập nhật');
  }

  return withTransaction(async (client) => {
    const booking = await lockBooking(client, id);

    if (data.branch_id) {
      await ensureBranch(client, data.branch_id);

      if (Number(data.branch_id) !== Number(booking.branch_id)) {
        await releaseAssignedTables(client, booking.id);
        await client.query('DELETE FROM booking_tables WHERE booking_id = $1', [booking.id]);
      }
    }

    let customerId = booking.customer_id;
    const nextCustomerName = data.customer_name || booking.customer_name;
    const nextPhone = data.phone || booking.phone;

    if (data.customer_name || data.phone) {
      customerId = await upsertCustomer(client, {
        customer_name: nextCustomerName,
        phone: nextPhone
      });
    }

    const updates = [];
    const values = [];

    function setColumn(column, value) {
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    }

    if (customerId !== booking.customer_id) {
      setColumn('customer_id', customerId);
    }

    for (const column of ['branch_id', 'customer_name', 'phone', 'booking_time', 'guest_count', 'note']) {
      if (Object.prototype.hasOwnProperty.call(data, column)) {
        setColumn(column, data[column]);
      }
    }

    if (hasStatus) {
      setColumn('status', nextStatus);
    }

    if (updates.length) {
      values.push(booking.id);
      await client.query(`UPDATE bookings SET ${updates.join(', ')} WHERE id = $${values.length}`, values);
    }

    if (hasStatus) {
      await logStatusChange(client, booking.id, booking.status, nextStatus, 'Đã cập nhật trạng thái đặt bàn');

      if (INACTIVE_RELEASE_STATUSES.includes(nextStatus)) {
        await releaseAssignedTables(client, booking.id);
      }
    }

    return getBookingById(booking.id, client);
  });
}

async function releaseAssignedTables(client, bookingId) {
  await client.query(
    `UPDATE tables
     SET status = 'AVAILABLE'
     WHERE id IN (SELECT table_id FROM booking_tables WHERE booking_id = $1)
       AND status IN ('RESERVED', 'OCCUPIED')`,
    [bookingId]
  );
}

async function assignTables(id, input) {
  const tableIds = normalizeTableIds(input);

  return withTransaction(async (client) => {
    const booking = await lockBooking(client, id);

    if (['CANCELLED', 'NO_SHOW', 'CHECKED_OUT', 'COMPLETED'].includes(booking.status)) {
      throw badRequest(`Không thể xếp bàn cho yêu cầu có trạng thái ${bookingStatusLabel(booking.status)}`);
    }

    const tablesResult = await client.query(
      `SELECT id, branch_id, table_code, status
       FROM tables
       WHERE id = ANY($1::BIGINT[])
       FOR UPDATE`,
      [tableIds]
    );

    if (tablesResult.rowCount !== tableIds.length) {
      throw badRequest('Một hoặc nhiều bàn không tồn tại');
    }

    const invalidBranchTables = tablesResult.rows.filter((table) => Number(table.branch_id) !== Number(booking.branch_id));
    if (invalidBranchTables.length) {
      throw badRequest('Tất cả bàn phải thuộc chi nhánh của yêu cầu đặt bàn');
    }

    const blockedTables = tablesResult.rows.filter((table) => table.status === 'BLOCKED');
    if (blockedTables.length) {
      throw conflict('Không thể xếp bàn đang tạm khóa', blockedTables.map((table) => table.table_code));
    }

    const conflicts = await client.query(
      `SELECT t.id, t.table_code, b.id AS booking_id, b.status
       FROM booking_tables bt
       JOIN bookings b ON b.id = bt.booking_id
       JOIN tables t ON t.id = bt.table_id
       WHERE bt.table_id = ANY($1::BIGINT[])
         AND b.id <> $2
         AND b.status = ANY($3::TEXT[])`,
      [tableIds, booking.id, ACTIVE_ASSIGNMENT_STATUSES]
    );

    if (conflicts.rowCount > 0) {
      throw conflict('Một hoặc nhiều bàn đã được xếp cho yêu cầu đặt bàn đang hoạt động', conflicts.rows);
    }

    const existingResult = await client.query('SELECT table_id FROM booking_tables WHERE booking_id = $1', [booking.id]);
    const existingIds = existingResult.rows.map((row) => Number(row.table_id));
    const removedIds = existingIds.filter((existingId) => !tableIds.includes(existingId));

    if (removedIds.length) {
      await client.query(
        `UPDATE tables SET status = 'AVAILABLE'
         WHERE id = ANY($1::BIGINT[]) AND status IN ('RESERVED', 'OCCUPIED')`,
        [removedIds]
      );
    }

    await client.query('DELETE FROM booking_tables WHERE booking_id = $1', [booking.id]);

    for (const tableId of tableIds) {
      await client.query('INSERT INTO booking_tables (booking_id, table_id) VALUES ($1, $2)', [booking.id, tableId]);
    }

    const tableStatus = booking.status === 'CHECKED_IN' ? 'OCCUPIED' : 'RESERVED';
    await client.query('UPDATE tables SET status = $1 WHERE id = ANY($2::BIGINT[])', [tableStatus, tableIds]);

    if (booking.status === 'PENDING') {
      await client.query("UPDATE bookings SET status = 'CONFIRMED' WHERE id = $1", [booking.id]);
      await logStatusChange(client, booking.id, 'PENDING', 'CONFIRMED', 'Đã xếp bàn cho khách');
    }

    return getBookingById(booking.id, client);
  });
}

async function checkInBooking(id, input = {}) {
  const actualGuestCount = parseOptionalPositiveInteger(input.actual_guest_count, 'actual_guest_count');
  const checkInAt = parseOptionalDate(input.check_in_at, 'check_in_at') || new Date();

  return withTransaction(async (client) => {
    const booking = await lockBooking(client, id);

    if (['CANCELLED', 'NO_SHOW', 'CHECKED_OUT', 'COMPLETED'].includes(booking.status)) {
      throw badRequest(`Không thể nhận bàn cho yêu cầu có trạng thái ${bookingStatusLabel(booking.status)}`);
    }

    const assignedResult = await client.query('SELECT table_id FROM booking_tables WHERE booking_id = $1', [booking.id]);
    if (assignedResult.rowCount === 0) {
      throw badRequest('Yêu cầu phải được xếp ít nhất một bàn trước khi nhận bàn');
    }

    const tableIds = assignedResult.rows.map((row) => Number(row.table_id));
    await client.query(
      `UPDATE bookings
       SET status = 'CHECKED_IN', check_in_at = $1, actual_guest_count = $2
       WHERE id = $3`,
      [checkInAt, actualGuestCount || booking.guest_count, booking.id]
    );
    await client.query("UPDATE tables SET status = 'OCCUPIED' WHERE id = ANY($1::BIGINT[])", [tableIds]);
    await logStatusChange(client, booking.id, booking.status, 'CHECKED_IN', 'Khách đã nhận bàn');

    return getBookingById(booking.id, client);
  });
}

async function checkOutBooking(id, input = {}) {
  const checkOutAt = parseOptionalDate(input.check_out_at, 'check_out_at') || new Date();

  return withTransaction(async (client) => {
    const booking = await lockBooking(client, id);

    if (booking.status !== 'CHECKED_IN') {
      throw badRequest('Chỉ yêu cầu đã nhận bàn mới có thể trả bàn');
    }

    await client.query(
      `UPDATE bookings
       SET status = 'CHECKED_OUT', check_out_at = $1
       WHERE id = $2`,
      [checkOutAt, booking.id]
    );
    await releaseAssignedTables(client, booking.id);
    await logStatusChange(client, booking.id, 'CHECKED_IN', 'CHECKED_OUT', 'Khách đã trả bàn');

    return getBookingById(booking.id, client);
  });
}

async function cancelBooking(id) {
  return withTransaction(async (client) => {
    const booking = await lockBooking(client, id);

    if (booking.status === 'CANCELLED') {
      return getBookingById(booking.id, client);
    }

    if (['CHECKED_OUT', 'COMPLETED'].includes(booking.status)) {
      throw badRequest(`Không thể hủy yêu cầu có trạng thái ${bookingStatusLabel(booking.status)}`);
    }

    await client.query("UPDATE bookings SET status = 'CANCELLED' WHERE id = $1", [booking.id]);
    await releaseAssignedTables(client, booking.id);
    await logStatusChange(client, booking.id, booking.status, 'CANCELLED', 'Đã hủy yêu cầu đặt bàn');

    return getBookingById(booking.id, client);
  });
}

async function deleteBooking(id) {
  return withTransaction(async (client) => {
    const booking = await lockBooking(client, id);

    if (booking.status === 'CHECKED_IN') {
      throw conflict('Không thể xóa yêu cầu khi khách đang sử dụng bàn');
    }

    await releaseAssignedTables(client, booking.id);
    const deletedBooking = await getBookingById(booking.id, client);
    await client.query('DELETE FROM bookings WHERE id = $1', [booking.id]);

    return deletedBooking;
  });
}

async function getDashboardData(query = {}) {
  const filters = dashboardFilters(query);
  const branchFilter = filters.branch_id ? { branch_id: filters.branch_id } : {};

  const [todayBookings, openBookings, closedBookings, activeTables, availableTables] = await Promise.all([
    listBookings({ ...branchFilter, period: 'today' }),
    listBookings({ ...branchFilter, period: 'open' }),
    listBookings({ ...branchFilter, period: 'closed' }),
    listTables({ ...branchFilter, status: 'RESERVED,OCCUPIED' }),
    listTables({ ...branchFilter, status: 'AVAILABLE' })
  ]);

  return {
    open_bookings: openBookings,
    closed_bookings: closedBookings,
    active_tables: activeTables,
    available_tables: availableTables,
    counts: {
      today_bookings: todayBookings.length,
      active_tables: activeTables.length,
      available_tables: availableTables.length,
      occupied_tables: activeTables.filter((table) => table.status === 'OCCUPIED').length
    },
    allowed_statuses: BOOKING_STATUSES,
    table_statuses: TABLE_STATUSES
  };
}

module.exports = {
  createBooking,
  deleteBooking,
  getBookingById,
  listBookings,
  listTables,
  updateBooking,
  assignTables,
  checkInBooking,
  checkOutBooking,
  cancelBooking,
  getDashboardData
};
