ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS area_id BIGINT REFERENCES areas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_area_id ON bookings(area_id);
