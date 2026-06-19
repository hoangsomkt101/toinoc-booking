ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS table_count INTEGER;

DROP INDEX IF EXISTS idx_tables_area_status;

ALTER TABLE tables
  DROP CONSTRAINT IF EXISTS tables_area_branch_fk,
  DROP CONSTRAINT IF EXISTS tables_area_id_fkey,
  DROP COLUMN IF EXISTS area_id;

UPDATE tables
SET table_code = CONCAT('__migrating_', id);

WITH ranked_tables AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY branch_id ORDER BY id ASC) AS table_number
  FROM tables
)
UPDATE tables t
SET table_code = ranked_tables.table_number::TEXT
FROM ranked_tables
WHERE t.id = ranked_tables.id;

UPDATE branches b
SET table_count = GREATEST(1, COALESCE(table_summary.table_count, 0))
FROM (
  SELECT branch_id, COUNT(*)::INTEGER AS table_count
  FROM tables
  GROUP BY branch_id
) table_summary
WHERE table_summary.branch_id = b.id;

UPDATE branches
SET table_count = 1
WHERE table_count IS NULL;

INSERT INTO tables (branch_id, table_code, capacity, status)
SELECT b.id, table_number::TEXT, 4, 'AVAILABLE'
FROM branches b
JOIN LATERAL generate_series(1, b.table_count) AS generated_tables(table_number) ON TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM tables t
  WHERE t.branch_id = b.id
    AND t.table_code = table_number::TEXT
);

ALTER TABLE branches
  DROP CONSTRAINT IF EXISTS branches_table_count_positive,
  ALTER COLUMN table_count SET NOT NULL,
  ADD CONSTRAINT branches_table_count_positive CHECK (table_count > 0);
