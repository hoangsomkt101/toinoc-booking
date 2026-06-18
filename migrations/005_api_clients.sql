CREATE TABLE api_clients (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  allowed_origin TEXT NOT NULL UNIQUE,
  api_key_hash TEXT NOT NULL UNIQUE,
  api_key_prefix TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_clients_active_origin ON api_clients(allowed_origin)
WHERE is_active = TRUE;

CREATE TRIGGER set_api_clients_updated_at BEFORE UPDATE ON api_clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
