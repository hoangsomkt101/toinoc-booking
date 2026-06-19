CREATE TABLE sheet_sync_targets (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('ALL', 'BRANCH')),
  branch_id BIGINT REFERENCES branches(id) ON DELETE CASCADE,
  webhook_url TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (target_type = 'ALL' AND branch_id IS NULL) OR
    (target_type = 'BRANCH' AND branch_id IS NOT NULL)
  )
);

CREATE INDEX idx_sheet_sync_targets_active ON sheet_sync_targets(is_active, target_type, branch_id);

CREATE TRIGGER set_sheet_sync_targets_updated_at BEFORE UPDATE ON sheet_sync_targets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
