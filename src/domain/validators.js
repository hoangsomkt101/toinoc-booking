const { BOOKING_STATUSES, TABLE_STATUSES } = require('./constants');
const { badRequest } = require('./errors');
const FIELD_LABELS = Object.freeze({
  id: 'Mã',
  customer_name: 'Tên khách hàng',
  phone: 'Số điện thoại',
  booking_time: 'Thời gian đặt bàn',
  guest_count: 'Số khách',
  note: 'Ghi chú',
  branch_id: 'Mã chi nhánh',
  table_ids: 'Danh sách bàn',
  table_count: 'Số bàn',
  capacity: 'Sức chứa',
  actual_guest_count: 'Số khách thực tế',
  check_in_at: 'Thời gian nhận bàn',
  check_out_at: 'Thời gian trả bàn'
});

function fieldLabel(field) {
  return FIELD_LABELS[field] || field;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeString(value, field) {
  if (typeof value !== 'string') {
    throw badRequest(`${fieldLabel(field)} phải là chuỗi ký tự`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw badRequest(`${fieldLabel(field)} là bắt buộc`);
  }

  return trimmed;
}

function optionalString(value, field) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw badRequest(`${fieldLabel(field)} phải là chuỗi ký tự`);
  }

  return value.trim() || null;
}

function parsePositiveInteger(value, field) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw badRequest(`${fieldLabel(field)} phải là số nguyên dương`);
  }

  return parsed;
}

function parseOptionalPositiveInteger(value, field) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return parsePositiveInteger(value, field);
}

function parseDate(value, field) {
  if (value === undefined || value === null || value === '') {
    throw badRequest(`${fieldLabel(field)} là bắt buộc`);
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw badRequest(`${fieldLabel(field)} phải là ngày giờ hợp lệ`);
  }

  return parsed;
}

function parseOptionalDate(value, field) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return parseDate(value, field);
}

function validateBookingStatus(status) {
  if (!BOOKING_STATUSES.includes(status)) {
    throw badRequest('Trạng thái đặt bàn không hợp lệ', { allowed: BOOKING_STATUSES });
  }

  return status;
}

function validateTableStatus(status) {
  if (!TABLE_STATUSES.includes(status)) {
    throw badRequest('Trạng thái bàn không hợp lệ', { allowed: TABLE_STATUSES });
  }

  return status;
}

function requireField(input, key) {
  if (!hasOwn(input, key) || input[key] === undefined || input[key] === null || input[key] === '') {
    throw badRequest(`${fieldLabel(key)} là bắt buộc`);
  }
}

function validateBookingPayload(input, options = {}) {
  const partial = options.partial === true;
  const payload = input || {};
  const data = {};
  const required = ['customer_name', 'phone', 'booking_time', 'guest_count', 'branch_id'];

  if (!partial) {
    for (const key of required) {
      requireField(payload, key);
    }
  }

  if (hasOwn(payload, 'customer_name')) {
    data.customer_name = normalizeString(payload.customer_name, 'customer_name');
  }

  if (hasOwn(payload, 'phone')) {
    data.phone = normalizeString(payload.phone, 'phone');
  }

  if (hasOwn(payload, 'booking_time')) {
    data.booking_time = parseDate(payload.booking_time, 'booking_time');
  }

  if (hasOwn(payload, 'guest_count')) {
    data.guest_count = parsePositiveInteger(payload.guest_count, 'guest_count');
  }

  if (hasOwn(payload, 'note')) {
    data.note = optionalString(payload.note, 'note');
  }

  if (hasOwn(payload, 'branch_id')) {
    data.branch_id = parsePositiveInteger(payload.branch_id, 'branch_id');
  }

  return data;
}

function normalizeTableIds(input) {
  const payload = input || {};
  const rawIds = hasOwn(payload, 'table_ids') ? payload.table_ids : payload.table_id;
  const values = Array.isArray(rawIds) ? rawIds : [rawIds];
  const ids = [...new Set(
    values
      .filter((value) => value !== undefined && value !== null && value !== '')
      .map((value) => parsePositiveInteger(value, 'table_ids'))
  )].sort((a, b) => a - b);

  if (ids.length === 0) {
    throw badRequest('Danh sách bàn là bắt buộc');
  }

  return ids;
}

module.exports = {
  parsePositiveInteger,
  parseOptionalPositiveInteger,
  parseOptionalDate,
  validateBookingPayload,
  validateBookingStatus,
  validateTableStatus,
  normalizeTableIds
};
