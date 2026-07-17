import { getPostgres, hasPostgresStorage } from "../db/postgres";

export const DEVICE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS device_pairing_sessions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  token_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('awaiting_device', 'awaiting_confirmation', 'confirmed', 'expired', 'locked')),
  confirmation_code_digest TEXT,
  confirmation_attempts INTEGER NOT NULL DEFAULT 0 CHECK (confirmation_attempts BETWEEN 0 AND 5),
  key_algorithm TEXT CHECK (key_algorithm IS NULL OR key_algorithm = 'ES256'),
  public_key_spki TEXT,
  app_version TEXT,
  device_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  registered_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (state = 'awaiting_device' AND confirmation_code_digest IS NULL AND public_key_spki IS NULL)
    OR state <> 'awaiting_device'
  ),
  CHECK (
    (state IN ('awaiting_confirmation', 'locked') AND key_algorithm = 'ES256' AND public_key_spki IS NOT NULL)
    OR state NOT IN ('awaiting_confirmation', 'locked')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS device_pairing_sessions_active_token
  ON device_pairing_sessions(token_digest)
  WHERE state IN ('awaiting_device', 'awaiting_confirmation');
CREATE INDEX IF NOT EXISTS device_pairing_sessions_owner_created
  ON device_pairing_sessions(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS device_pairing_sessions_expiry
  ON device_pairing_sessions(expires_at)
  WHERE state IN ('awaiting_device', 'awaiting_confirmation');

CREATE TABLE IF NOT EXISTS paired_devices (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  pairing_session_id TEXT NOT NULL UNIQUE REFERENCES device_pairing_sessions(id),
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'revoked')),
  key_algorithm TEXT NOT NULL CHECK (key_algorithm = 'ES256'),
  public_key_spki TEXT NOT NULL,
  app_version TEXT NOT NULL,
  last_sequence BIGINT NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS paired_devices_owner_status
  ON paired_devices(owner_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS device_sync_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  device_id TEXT NOT NULL REFERENCES paired_devices(id),
  event_id TEXT NOT NULL,
  sequence BIGINT NOT NULL CHECK (sequence > 0),
  payload_type TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (device_id, event_id),
  UNIQUE (device_id, sequence)
);

CREATE INDEX IF NOT EXISTS device_sync_events_owner_accepted
  ON device_sync_events(owner_id, accepted_at DESC);

CREATE TABLE IF NOT EXISTS device_audit_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  device_id TEXT,
  pairing_session_id TEXT,
  action TEXT NOT NULL,
  safe_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS device_audit_events_owner_created
  ON device_audit_events(owner_id, created_at ASC, id ASC);

CREATE OR REPLACE FUNCTION reject_device_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'device audit history is append only';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'device_audit_events_append_only'
      AND tgrelid = 'device_audit_events'::REGCLASS
  ) THEN
    CREATE TRIGGER device_audit_events_append_only
      BEFORE UPDATE OR DELETE ON device_audit_events
      FOR EACH ROW EXECUTE FUNCTION reject_device_audit_mutation();
  END IF;
END;
$$;
`;

let schemaReady: Promise<void> | null = null;

export async function ensureDeviceSchema() {
  if (!hasPostgresStorage()) return;
  schemaReady ??= getPostgres().unsafe(DEVICE_SCHEMA_SQL).then(() => undefined).catch((error) => {
    schemaReady = null;
    throw error;
  });
  await schemaReady;
}

export function resetDeviceSchemaForTests() {
  schemaReady = null;
}
