CREATE TEMP TABLE normalized_customers AS
SELECT
  id,
  customer_name,
  CASE
    WHEN REGEXP_REPLACE(phone, '\D', '', 'g') LIKE '0084%' THEN '0' || SUBSTRING(REGEXP_REPLACE(phone, '\D', '', 'g') FROM 5)
    WHEN REGEXP_REPLACE(phone, '\D', '', 'g') LIKE '84%' AND LENGTH(REGEXP_REPLACE(phone, '\D', '', 'g')) >= 10 THEN '0' || SUBSTRING(REGEXP_REPLACE(phone, '\D', '', 'g') FROM 3)
    ELSE REGEXP_REPLACE(phone, '\D', '', 'g')
  END AS normalized_phone,
  updated_at
FROM customers;

CREATE TEMP TABLE canonical_customers AS
SELECT DISTINCT ON (normalized_phone)
  id AS canonical_id,
  normalized_phone,
  customer_name
FROM normalized_customers
WHERE normalized_phone <> ''
ORDER BY normalized_phone, updated_at DESC, id DESC;

UPDATE bookings b
SET
  customer_id = cc.canonical_id,
  phone = cc.normalized_phone
FROM normalized_customers nc
JOIN canonical_customers cc ON cc.normalized_phone = nc.normalized_phone
WHERE b.customer_id = nc.id;

UPDATE bookings
SET phone = CASE
  WHEN REGEXP_REPLACE(phone, '\D', '', 'g') LIKE '0084%' THEN '0' || SUBSTRING(REGEXP_REPLACE(phone, '\D', '', 'g') FROM 5)
  WHEN REGEXP_REPLACE(phone, '\D', '', 'g') LIKE '84%' AND LENGTH(REGEXP_REPLACE(phone, '\D', '', 'g')) >= 10 THEN '0' || SUBSTRING(REGEXP_REPLACE(phone, '\D', '', 'g') FROM 3)
  ELSE REGEXP_REPLACE(phone, '\D', '', 'g')
END;

DELETE FROM customers c
USING normalized_customers nc, canonical_customers cc
WHERE c.id = nc.id
  AND nc.normalized_phone = cc.normalized_phone
  AND c.id <> cc.canonical_id;

UPDATE customers c
SET phone = cc.normalized_phone
FROM canonical_customers cc
WHERE c.id = cc.canonical_id;

INSERT INTO customers (customer_name, phone)
SELECT DISTINCT ON (b.phone)
  b.customer_name,
  b.phone
FROM bookings b
WHERE b.phone <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM customers c
    WHERE c.phone = b.phone
  )
ORDER BY b.phone, b.booking_time DESC, b.id DESC
ON CONFLICT (phone) DO NOTHING;

UPDATE bookings b
SET customer_id = c.id
FROM customers c
WHERE b.phone = c.phone
  AND (b.customer_id IS NULL OR b.customer_id <> c.id);

CREATE INDEX IF NOT EXISTS idx_bookings_customer_time ON bookings(customer_id, booking_time DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_phone_time ON bookings(phone, booking_time DESC);
