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

CREATE TABLE IF NOT EXISTS oauth_login_states (
  state_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('kakao', 'naver')),
  pending_coupon_hash TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

CREATE TABLE IF NOT EXISTS coupon_codes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  code_hint TEXT NOT NULL,
  coupon_type TEXT NOT NULL CHECK (coupon_type IN ('access_duration', 'percentage_discount', 'fixed_discount')),
  value_amount INTEGER,
  access_days INTEGER,
  currency TEXT,
  duration TEXT NOT NULL CHECK (duration IN ('once', 'months', 'forever')),
  duration_months INTEGER,
  max_redemptions INTEGER NOT NULL,
  per_user_limit INTEGER NOT NULL,
  redemption_count INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  polar_discount_id TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id TEXT PRIMARY KEY,
  coupon_id TEXT NOT NULL REFERENCES coupon_codes(id),
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'redeemed', 'void')),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS coupon_redemptions_user_status
  ON coupon_redemptions(user_id, status, reserved_at DESC);

CREATE TABLE IF NOT EXISTS access_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('coupon', 'admin')),
  coupon_id TEXT REFERENCES coupon_codes(id),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS access_grants_user_active
  ON access_grants(user_id, status, ends_at DESC);

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
