import { getPostgres } from "../db/postgres";

export const BILLING_SCHEMA_SQL = String.raw`
CREATE TABLE IF NOT EXISTS billing_payment_attempts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('portone_kpn_v2', 'portone_kcp_v1')),
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'live')),
  purpose TEXT NOT NULL CHECK (purpose IN ('general', 'subscription_setup', 'subscription_charge')),
  status TEXT NOT NULL CHECK (status IN ('created', 'pending_provider', 'verification_pending', 'test_succeeded', 'succeeded', 'failed', 'expired')),
  idempotency_key TEXT NOT NULL,
  provider_payment_id TEXT,
  expected_amount BIGINT NOT NULL CHECK (expected_amount > 0),
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK (currency = 'KRW'),
  order_name TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  failure_code TEXT,
  safe_failure_message TEXT,
  safe_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_payment_attempts_idempotency_idx
  ON billing_payment_attempts(provider, environment, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS billing_payment_attempts_provider_payment_idx
  ON billing_payment_attempts(provider, environment, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS billing_payment_attempts_owner_idx
  ON billing_payment_attempts(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_methods (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('portone_kpn_v2', 'portone_kcp_v1')),
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'live')),
  provider_reference_ciphertext TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  card_brand TEXT,
  card_last4 TEXT CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS billing_methods_owner_idx ON billing_methods(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('portone_kpn_v2', 'portone_kcp_v1')),
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'live')),
  billing_method_id TEXT NOT NULL REFERENCES billing_methods(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'canceled', 'ended')),
  product_key TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  base_amount BIGINT NOT NULL CHECK (base_amount > 0),
  discounted_amount BIGINT CHECK (discounted_amount IS NULL OR discounted_amount > 0),
  discount_remaining_cycles INTEGER NOT NULL DEFAULT 0 CHECK (discount_remaining_cycles >= 0),
  discount_forever BOOLEAN NOT NULL DEFAULT FALSE,
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK (currency = 'KRW'),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_subscriptions_one_active_owner
  ON billing_subscriptions(owner_id) WHERE status IN ('active', 'past_due');
CREATE UNIQUE INDEX IF NOT EXISTS billing_subscriptions_owner_active_idx
  ON billing_subscriptions(owner_id) WHERE status IN ('active', 'past_due');
CREATE INDEX IF NOT EXISTS billing_subscriptions_owner_idx ON billing_subscriptions(owner_id, created_at DESC);

ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS base_amount BIGINT;
ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS discounted_amount BIGINT;
ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS discount_remaining_cycles INTEGER NOT NULL DEFAULT 0;
ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS discount_forever BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE billing_subscriptions SET base_amount = amount WHERE base_amount IS NULL;
ALTER TABLE billing_subscriptions ALTER COLUMN base_amount SET NOT NULL;

CREATE TABLE IF NOT EXISTS billing_charge_jobs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL REFERENCES billing_subscriptions(id),
  provider TEXT NOT NULL,
  environment TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK (currency = 'KRW'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'dead_letter', 'canceled')),
  priority INTEGER NOT NULL DEFAULT 0,
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_run_at TIMESTAMPTZ NOT NULL,
  locked_until TIMESTAMPTZ,
  worker_id TEXT,
  fencing_token BIGINT NOT NULL DEFAULT 0,
  payment_attempt_id TEXT REFERENCES billing_payment_attempts(id),
  last_error_code TEXT,
  safe_last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_charge_jobs_idempotency_idx
  ON billing_charge_jobs(provider, environment, idempotency_key);
CREATE INDEX IF NOT EXISTS billing_charge_jobs_due_idx
  ON billing_charge_jobs(status, next_run_at, priority DESC);

CREATE TABLE IF NOT EXISTS billing_webhook_inbox (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  environment TEXT NOT NULL,
  event_key TEXT NOT NULL,
  provider_payment_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  occurred_at TIMESTAMPTZ NOT NULL,
  safe_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  safe_error_message TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_webhook_inbox_event_idx
  ON billing_webhook_inbox(provider, environment, event_key);

CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  provider TEXT,
  environment TEXT,
  event_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  amount BIGINT,
  currency TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  safe_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS billing_events_owner_idx ON billing_events(owner_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION reject_billing_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'billing event history is append only';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'billing_events_append_only' AND tgrelid = 'billing_events'::REGCLASS
  ) THEN
    CREATE TRIGGER billing_events_append_only
      BEFORE UPDATE OR DELETE ON billing_events
      FOR EACH ROW EXECUTE FUNCTION reject_billing_event_mutation();
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS billing_refund_requests (
  id TEXT PRIMARY KEY,
  payment_attempt_id TEXT NOT NULL REFERENCES billing_payment_attempts(id),
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('portone_kpn_v2', 'portone_kcp_v1')),
  environment TEXT NOT NULL CHECK (environment = 'live'),
  provider_payment_id TEXT NOT NULL,
  provider_refund_id TEXT,
  amount BIGINT NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'KRW' CHECK (currency = 'KRW'),
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('processing', 'pending_provider', 'succeeded', 'failed')),
  requested_by TEXT NOT NULL,
  safe_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS billing_refund_requests_payment_idx
  ON billing_refund_requests(provider, environment, provider_payment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_worker_heartbeats (
  worker_id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stopped_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS billing_provider_settings (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  primary_provider TEXT NOT NULL CHECK (primary_provider IN ('portone_kpn_v2', 'portone_kcp_v1')),
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

let schemaReady: Promise<void> | null = null;

export async function ensureBillingSchema() {
  schemaReady ??= getPostgres().unsafe(BILLING_SCHEMA_SQL).then(() => undefined).catch((error) => {
    schemaReady = null;
    throw error;
  });
  await schemaReady;
}

export function resetBillingSchemaForTests() {
  schemaReady = null;
}
