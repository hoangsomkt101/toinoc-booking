const BOOKING_STATUSES = Object.freeze([
  'PENDING',
  'CONFIRMED',
  'CANCELLED',
  'NO_SHOW',
  'CHECKED_IN',
  'CHECKED_OUT',
  'COMPLETED'
]);

const TABLE_STATUSES = Object.freeze(['AVAILABLE', 'RESERVED', 'OCCUPIED', 'BLOCKED']);

const ROLE_NAMES = Object.freeze(['Owner', 'Manager', 'Sale']);

const SOCKET_EVENTS = Object.freeze({
  booking_created: 'booking_created',
  booking_updated: 'booking_updated',
  booking_cancelled: 'booking_cancelled',
  booking_assigned: 'booking_assigned',
  booking_checked_in: 'booking_checked_in',
  booking_checked_out: 'booking_checked_out',
  table_assignment_changed: 'table_assignment_changed',
  staff_online: 'staff_online',
  staff_offline: 'staff_offline'
});

const ACTIVE_ASSIGNMENT_STATUSES = Object.freeze(['PENDING', 'CONFIRMED', 'CHECKED_IN']);

module.exports = {
  BOOKING_STATUSES,
  TABLE_STATUSES,
  ROLE_NAMES,
  SOCKET_EVENTS,
  ACTIVE_ASSIGNMENT_STATUSES
};
