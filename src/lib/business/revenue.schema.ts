import { getPostgres } from "../db/postgres";

export const REVENUE_SCHEMA_SQL = String.raw`
CREATE TABLE IF NOT EXISTS revenue_candidates (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  transaction_fingerprint TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  capture_method TEXT NOT NULL CHECK (capture_method IN ('notification_listener', 'share_extension', 'manual', 'gmail', 'csv', 'billing')),
  source_app TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  raw_encrypted JSONB NOT NULL,
  amount BIGINT,
  confirmed_amount BIGINT,
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK (currency = 'KRW'),
  direction TEXT NOT NULL CHECK (direction IN ('income', 'expense', 'cancellation', 'unknown')),
  classification TEXT NOT NULL DEFAULT 'unknown' CHECK (classification IN ('unknown', 'revenue', 'expense', 'personal', 'duplicate', 'rejected')),
  counterparty_hint TEXT,
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_state TEXT NOT NULL DEFAULT 'provisional' CHECK (review_state IN ('provisional', 'confirmed', 'expense', 'personal', 'duplicate', 'rejected')),
  linked_candidate_id TEXT REFERENCES revenue_candidates(id),
  confirmed_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS revenue_candidates_owner_event_idx ON revenue_candidates(owner_id, event_id);
CREATE UNIQUE INDEX IF NOT EXISTS revenue_candidates_owner_fingerprint_idx ON revenue_candidates(owner_id, transaction_fingerprint);
CREATE INDEX IF NOT EXISTS revenue_candidates_owner_review_idx ON revenue_candidates(owner_id, review_state, captured_at DESC);

CREATE TABLE IF NOT EXISTS revenue_source_trust_rules (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  source_app TEXT NOT NULL,
  auto_confirm_high_confidence BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_id, platform, source_app)
);

CREATE TABLE IF NOT EXISTS revenue_audit_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL REFERENCES revenue_candidates(id),
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'trusted_source', 'billing', 'system')),
  safe_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS revenue_audit_owner_idx ON revenue_audit_events(owner_id, created_at DESC);
CREATE OR REPLACE FUNCTION prevent_revenue_audit_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'revenue audit events are append-only'; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS revenue_audit_no_update ON revenue_audit_events;
CREATE TRIGGER revenue_audit_no_update BEFORE UPDATE OR DELETE ON revenue_audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_revenue_audit_mutation();
`;

let ready: Promise<void> | null = null;
export async function ensureRevenueSchema() {
  ready ??= getPostgres().unsafe(REVENUE_SCHEMA_SQL).then(() => undefined).catch((error) => { ready = null; throw error; });
  await ready;
}
export function resetRevenueSchemaForTests() { ready = null; }
