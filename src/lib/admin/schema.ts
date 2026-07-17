import { getPostgres, hasPostgresStorage } from "../db/postgres";

export const ADMIN_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS user_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deletion_pending', 'deleted')),
  session_version INTEGER NOT NULL DEFAULT 1 CHECK (session_version > 0),
  deletion_scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_accounts_normalized_email
  ON user_accounts (LOWER(email));

CREATE TABLE IF NOT EXISTS auth_identities (
  account_id TEXT NOT NULL REFERENCES user_accounts(id),
  provider TEXT NOT NULL CHECK (provider IN ('password', 'kakao', 'naver')),
  provider_subject TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS auth_identities_account_id
  ON auth_identities(account_id);

CREATE TABLE IF NOT EXISTS admin_audit_events (
  id TEXT PRIMARY KEY,
  actor_account_id TEXT NOT NULL,
  target_account_id TEXT,
  action TEXT NOT NULL,
  safe_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION reject_admin_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'administrator audit history is append only';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'admin_audit_events_append_only') THEN
    CREATE TRIGGER admin_audit_events_append_only
      BEFORE UPDATE OR DELETE ON admin_audit_events
      FOR EACH ROW EXECUTE FUNCTION reject_admin_audit_mutation();
  END IF;
END;
$$;
`;

let schemaReady: Promise<void> | null = null;

export async function ensureAdminSchema() {
  if (!hasPostgresStorage()) return;
  schemaReady ??= getPostgres()
    .unsafe(ADMIN_SCHEMA_SQL)
    .then(() => undefined)
    .catch((error) => {
      schemaReady = null;
      throw error;
    });
  await schemaReady;
}

export function resetAdminSchemaForTests() {
  schemaReady = null;
}

