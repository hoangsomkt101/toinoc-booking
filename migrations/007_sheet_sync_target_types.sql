WITH ranked_targets AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY target_type
      ORDER BY is_active DESC, updated_at DESC, created_at DESC, id DESC
    ) AS row_number
  FROM sheet_sync_targets
)
DELETE FROM sheet_sync_targets
WHERE id IN (
  SELECT id FROM ranked_targets WHERE row_number > 1
);

ALTER TABLE sheet_sync_targets DROP CONSTRAINT IF EXISTS sheet_sync_targets_check;

UPDATE sheet_sync_targets
SET branch_id = NULL
WHERE branch_id IS NOT NULL;

ALTER TABLE sheet_sync_targets
  ADD CONSTRAINT sheet_sync_targets_type_shape_check
  CHECK (target_type IN ('ALL', 'BRANCH') AND branch_id IS NULL);

CREATE UNIQUE INDEX idx_sheet_sync_targets_target_type_unique ON sheet_sync_targets(target_type);

UPDATE branches
SET address = CASE name
  WHEN 'Quận 1' THEN 'đường võ văn kiệt, Quận 1, TP.HCM'
  WHEN 'Bình Thạnh' THEN 'đường điện biên phủ, Quận Bình Thạnh, TP.HCM'
  WHEN 'Quận 10' THEN 'đường thành thái, Quận 10, TP.HCM'
  ELSE address
END
WHERE name IN ('Quận 1', 'Bình Thạnh', 'Quận 10');
