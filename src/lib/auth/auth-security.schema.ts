import { getPostgres, hasPostgresStorage } from "../db/postgres";

export const AUTH_SECURITY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS account_totp_factors (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE REFERENCES user_accounts(id) ON DELETE CASCADE,
  secret_encrypted JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'disabled')),
  last_accepted_counter BIGINT CHECK (last_accepted_counter IS NULL OR last_accepted_counter >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account_totp_challenges (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('totp_enrollment', 'mfa_login')),
  challenge_hash TEXT NOT NULL,
  failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count BETWEEN 0 AND 5),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, purpose, challenge_hash)
);

CREATE INDEX IF NOT EXISTS account_totp_challenges_active
  ON account_totp_challenges(account_id, purpose, expires_at)
  WHERE consumed_at IS NULL AND failure_count < 5;

CREATE TABLE IF NOT EXISTS account_recovery_codes (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, code_hash)
);

CREATE INDEX IF NOT EXISTS account_recovery_codes_unused
  ON account_recovery_codes(account_id, created_at DESC)
  WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_security_rate_limits (
  scope_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK (
    action IN ('enrollment', 'enrollment_verification', 'recovery_regeneration', 'disable', 'login_verification')
  ),
  window_started_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL CHECK (attempt_count > 0),
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope_key, action)
);

CREATE INDEX IF NOT EXISTS auth_security_rate_limits_blocked
  ON auth_security_rate_limits(blocked_until)
  WHERE blocked_until IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_security_audit_events (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  actor_account_id TEXT NOT NULL,
  action TEXT NOT NULL,
  safe_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_security_audit_events_account_created
  ON auth_security_audit_events(account_id, created_at ASC);

CREATE OR REPLACE FUNCTION reject_auth_security_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'authentication security audit history is append only';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'auth_security_audit_events_append_only'
      AND tgrelid = 'auth_security_audit_events'::REGCLASS
  ) THEN
    CREATE TRIGGER auth_security_audit_events_append_only
      BEFORE UPDATE OR DELETE ON auth_security_audit_events
      FOR EACH ROW EXECUTE FUNCTION reject_auth_security_audit_mutation();
  END IF;
END;
$$;
`;

let schemaReady: Promise<void> | null = null;

export async function ensureAuthSecuritySchema() {
  if (!hasPostgresStorage()) return;
  schemaReady ??= getPostgres()
    .unsafe(AUTH_SECURITY_SCHEMA_SQL)
    .then(() => undefined)
    .catch((error) => {
      schemaReady = null;
      throw error;
    });
  await schemaReady;
}

export function resetAuthSecuritySchemaForTests() {
  schemaReady = null;
}
