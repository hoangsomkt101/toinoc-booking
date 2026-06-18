CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE branches (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE staffs (
  id BIGSERIAL PRIMARY KEY,
  branch_id BIGINT REFERENCES branches(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('Owner', 'Manager', 'Sale')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customers (
  id BIGSERIAL PRIMARY KEY,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE areas (
  id BIGSERIAL PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, name)
);

CREATE TABLE tables (
  id BIGSERIAL PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  area_id BIGINT NOT NULL REFERENCES areas(id) ON DELETE RESTRICT,
  table_code TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'BLOCKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, table_code)
);

CREATE TABLE bookings (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  booking_time TIMESTAMPTZ NOT NULL,
  guest_count INTEGER NOT NULL CHECK (guest_count > 0),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED')),
  actual_guest_count INTEGER CHECK (actual_guest_count IS NULL OR actual_guest_count > 0),
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE booking_tables (
  booking_id BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  table_id BIGINT NOT NULL REFERENCES tables(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (booking_id, table_id)
);

CREATE TABLE booking_status_logs (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED')),
  to_status TEXT NOT NULL CHECK (to_status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED')),
  note TEXT,
  changed_by_staff_id BIGINT REFERENCES staffs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
  id BIGSERIAL PRIMARY KEY,
  branch_id BIGINT REFERENCES branches(id) ON DELETE CASCADE,
  staff_id BIGINT REFERENCES staffs(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_branch_time ON bookings(branch_id, booking_time);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_booking_tables_table_id ON booking_tables(table_id);
CREATE INDEX idx_tables_branch_status ON tables(branch_id, status);
CREATE INDEX idx_notifications_branch_read ON notifications(branch_id, read_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_branches_updated_at BEFORE UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_staffs_updated_at BEFORE UPDATE ON staffs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_areas_updated_at BEFORE UPDATE ON areas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_tables_updated_at BEFORE UPDATE ON tables FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
