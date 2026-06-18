DO $$
DECLARE
  default_branch_ids BIGINT[];
  deleted_customer_ids BIGINT[];
BEGIN
  SELECT COALESCE(array_agg(id), ARRAY[]::BIGINT[])
  INTO default_branch_ids
  FROM branches
  WHERE lower(name) IN ('main branch', 'default branch');

  IF cardinality(default_branch_ids) = 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT customer_id), ARRAY[]::BIGINT[])
  INTO deleted_customer_ids
  FROM bookings
  WHERE branch_id = ANY(default_branch_ids)
    AND customer_id IS NOT NULL;

  DELETE FROM bookings
  WHERE branch_id = ANY(default_branch_ids);

  DELETE FROM notifications
  WHERE branch_id = ANY(default_branch_ids);

  UPDATE users
  SET branch_id = NULL
  WHERE branch_id = ANY(default_branch_ids);

  UPDATE staffs
  SET branch_id = NULL
  WHERE branch_id = ANY(default_branch_ids);

  DELETE FROM tables
  WHERE branch_id = ANY(default_branch_ids);

  DELETE FROM areas
  WHERE branch_id = ANY(default_branch_ids);

  DELETE FROM branches
  WHERE id = ANY(default_branch_ids);

  DELETE FROM customers c
  WHERE c.id = ANY(deleted_customer_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM bookings b
      WHERE b.customer_id = c.id
    );
END $$;
