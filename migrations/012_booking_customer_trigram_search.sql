CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_customers_customer_name_trgm
  ON customers USING GIN (customer_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customers_phone_trgm
  ON customers USING GIN (phone gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_bookings_customer_name_trgm
  ON bookings USING GIN (customer_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_bookings_phone_trgm
  ON bookings USING GIN (phone gin_trgm_ops);
