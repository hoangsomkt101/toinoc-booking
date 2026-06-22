const { BOOKING_STATUSES, TABLE_STATUSES } = require('./constants');
const { badRequest } = require('./errors');
const FIELD_LABELS = Object.freeze({
  id: 'Mã',
  customer_name: 'Tên khách hàng',
  phone: 'Số điện thoại',
  booking_time: 'Thời gian đặt bàn',
  guest_count: 'Số khách',
  order_staff_name: 'Tên nhân viên lên đơn',
  note: 'Ghi chú',
  branch_id: 'Mã chi nhánh',
  area_id: 'Mã khu vực',
  table_ids: 'Danh sách bàn',
  table_count: 'Số bàn',
  capacity: 'Sức chứa',
  actual_guest_count: 'Số khách thực tế',
  check_in_at: 'Thời gian nhận bàn',
  check_out_at: 'Thời gian trả bàn'
});
const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;
const VIETNAM_TIME_ZONE_OFFSET = '+07:00';
const WALK_IN_LABEL = 'Vãng lai';
const WALK_IN_PHONE = '000';

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

function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ');
}

function normalizePhone(value, field = 'phone') {
  const rawValue = normalizeString(value, field);
  if (normalizeSearchText(rawValue) === 'vang lai') {
    return WALK_IN_PHONE;
  }

  const digits = rawValue.replace(/\D/g, '');

  if (!digits) {
    throw badRequest(`${fieldLabel(field)} phải có ít nhất một chữ số`);
  }

  if (digits.startsWith('0084') && digits.length > 4) {
    return `0${digits.slice(4)}`;
  }

  if (digits.startsWith('84') && digits.length >= 10) {
    return `0${digits.slice(2)}`;
  }

  return digits;
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

function parseDate(value, field, options = {}) {
  if (value === undefined || value === null || value === '') {
    throw badRequest(`${fieldLabel(field)} là bắt buộc`);
  }

  let dateValue = value;
  if (options.assumeVietnamTimeZone && typeof value === 'string') {
    const trimmed = value.trim();
    dateValue = LOCAL_DATE_TIME_PATTERN.test(trimmed) ? `${trimmed}${VIETNAM_TIME_ZONE_OFFSET}` : trimmed;
  }

  const parsed = new Date(dateValue);

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
  const allowWalkIn = options.allowWalkIn === true;
  const payload = { ...(input || {}) };
  const data = {};
  const required = ['customer_name', 'phone', 'booking_time', 'guest_count', 'branch_id'];

  if (!partial && allowWalkIn) {
    if (!hasOwn(payload, 'customer_name') || payload.customer_name === undefined || payload.customer_name === null || payload.customer_name === '') {
      payload.customer_name = WALK_IN_LABEL;
    }

    if (!hasOwn(payload, 'phone') || payload.phone === undefined || payload.phone === null || payload.phone === '') {
      payload.phone = WALK_IN_PHONE;
    }
  }

  if (!partial) {
    for (const key of required) {
      requireField(payload, key);
    }
  }

  if (hasOwn(payload, 'customer_name')) {
    data.customer_name = normalizeString(payload.customer_name, 'customer_name');
  }

  if (hasOwn(payload, 'phone')) {
    data.phone = normalizePhone(payload.phone, 'phone');
  }

  if (hasOwn(payload, 'booking_time')) {
    data.booking_time = parseDate(payload.booking_time, 'booking_time', { assumeVietnamTimeZone: true });
  }

  if (hasOwn(payload, 'guest_count')) {
    data.guest_count = parsePositiveInteger(payload.guest_count, 'guest_count');
  }

  if (hasOwn(payload, 'order_staff_name')) {
    data.order_staff_name = optionalString(payload.order_staff_name, 'order_staff_name');
  }

  if (hasOwn(payload, 'note')) {
    data.note = optionalString(payload.note, 'note');
  }

  if (hasOwn(payload, 'branch_id')) {
    data.branch_id = parsePositiveInteger(payload.branch_id, 'branch_id');
  }

  if (hasOwn(payload, 'area_id')) {
    data.area_id = parseOptionalPositiveInteger(payload.area_id, 'area_id') || null;
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
  WALK_IN_LABEL,
  WALK_IN_PHONE,
  normalizePhone,
  parsePositiveInteger,
  parseOptionalPositiveInteger,
  parseOptionalDate,
  validateBookingPayload,
  validateBookingStatus,
  validateTableStatus,
  normalizeTableIds
};
