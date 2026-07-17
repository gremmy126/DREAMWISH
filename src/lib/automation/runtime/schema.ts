import { getPostgres, hasPostgresStorage } from "../../db/postgres";

export class AutomationRuntimeConfigurationError extends Error {
  readonly code = "AUTOMATION_DATABASE_REQUIRED";
  constructor() {
    super("DATABASE_URL is required for the durable Automation Engine.");
    this.name = "AutomationRuntimeConfigurationError";
  }
}

export const AUTOMATION_RUNTIME_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS automation_workflows (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  current_version INTEGER NOT NULL DEFAULT 1,
  active_version INTEGER,
  approval_policy TEXT NOT NULL DEFAULT 'high_risk_two_stage',
  approval_expiry_minutes INTEGER NOT NULL DEFAULT 30,
  notification_channels TEXT[] NOT NULL DEFAULT ARRAY['in_app']::TEXT[],
  medium_policy TEXT NOT NULL DEFAULT 'automatic',
  critical_auth_policy TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, id)
);

CREATE TABLE IF NOT EXISTS automation_workflow_versions (
  workflow_id TEXT NOT NULL REFERENCES automation_workflows(id),
  owner_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  workflow_snapshot JSONB NOT NULL,
  content_hash TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workflow_id, version),
  UNIQUE (owner_id, workflow_id, content_hash)
);

CREATE TABLE IF NOT EXISTS automation_nodes (
  workflow_id TEXT NOT NULL,
  workflow_version INTEGER NOT NULL,
  owner_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  action_id TEXT,
  action_version INTEGER,
  adapter_key TEXT,
  adapter_version INTEGER,
  integration_connection_id TEXT,
  input_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  retry_policy JSONB NOT NULL DEFAULT '{}'::JSONB,
  timeout_policy JSONB NOT NULL DEFAULT '{}'::JSONB,
  position JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workflow_id, workflow_version, node_id),
  FOREIGN KEY (workflow_id, workflow_version) REFERENCES automation_workflow_versions(workflow_id, version)
);

CREATE TABLE IF NOT EXISTS automation_edges (
  workflow_id TEXT NOT NULL,
  workflow_version INTEGER NOT NULL,
  owner_id TEXT NOT NULL,
  edge_id TEXT NOT NULL,
  source_node_id TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  source_handle TEXT,
  target_handle TEXT,
  condition_json JSONB,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workflow_id, workflow_version, edge_id),
  FOREIGN KEY (workflow_id, workflow_version) REFERENCES automation_workflow_versions(workflow_id, version)
);

CREATE TABLE IF NOT EXISTS automation_action_snapshots (
  app_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  action_version INTEGER NOT NULL,
  adapter_key TEXT NOT NULL,
  adapter_version INTEGER NOT NULL,
  output_schema_version INTEGER NOT NULL,
  definition_json JSONB NOT NULL,
  definition_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (app_id, action_id, action_version, adapter_version),
  UNIQUE (definition_hash)
);

CREATE TABLE IF NOT EXISTS automation_executions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  workflow_version INTEGER NOT NULL,
  parent_execution_id TEXT REFERENCES automation_executions(id),
  resumed_from_step_id TEXT,
  execution_mode TEXT NOT NULL CHECK (execution_mode IN ('test', 'live', 'manual')),
  trigger_type TEXT NOT NULL,
  trigger_event_id TEXT,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (workflow_id, workflow_version) REFERENCES automation_workflow_versions(workflow_id, version),
  UNIQUE (owner_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS automation_execution_trigger_dedupe
  ON automation_executions(owner_id, workflow_id, trigger_type, trigger_event_id)
  WHERE trigger_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS automation_executions_owner_created
  ON automation_executions(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS automation_execution_trigger_payloads (
  execution_id TEXT PRIMARY KEY REFERENCES automation_executions(id),
  owner_id TEXT NOT NULL,
  payload_ciphertext TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS automation_execution_trigger_payloads_owner
  ON automation_execution_trigger_payloads(owner_id, execution_id);

CREATE TABLE IF NOT EXISTS automation_step_runs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  execution_id TEXT NOT NULL REFERENCES automation_executions(id),
  node_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  action_version INTEGER NOT NULL,
  adapter_key TEXT NOT NULL,
  adapter_version INTEGER NOT NULL,
  integration_connection_id TEXT,
  risk_level TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  retry_count INTEGER NOT NULL DEFAULT 0,
  duration_ms BIGINT,
  api_request_id TEXT,
  rate_limit_remaining BIGINT,
  adapter_latency_ms BIGINT,
  masked_input JSONB NOT NULL DEFAULT '{}'::JSONB,
  masked_output JSONB,
  preview_data JSONB,
  error_code TEXT,
  error_message TEXT,
  fencing_token BIGINT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (execution_id, node_id, attempt)
);

CREATE TABLE IF NOT EXISTS automation_step_execution_inputs (
  step_run_id TEXT PRIMARY KEY REFERENCES automation_step_runs(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  input_ciphertext TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS automation_step_execution_inputs_owner
  ON automation_step_execution_inputs(owner_id, step_run_id);

CREATE TABLE IF NOT EXISTS automation_execution_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  execution_id TEXT NOT NULL REFERENCES automation_executions(id),
  step_run_id TEXT REFERENCES automation_step_runs(id),
  prior_state TEXT,
  new_state TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  safe_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS automation_execution_events_history
  ON automation_execution_events(owner_id, execution_id, created_at, id);

CREATE TABLE IF NOT EXISTS automation_approval_requests (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  workflow_version INTEGER NOT NULL,
  execution_id TEXT NOT NULL REFERENCES automation_executions(id),
  step_run_id TEXT NOT NULL REFERENCES automation_step_runs(id),
  node_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  action_version INTEGER NOT NULL,
  adapter_version INTEGER NOT NULL,
  integration_connection_id TEXT,
  snapshot_json JSONB NOT NULL,
  snapshot_hash TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  output_schema_version INTEGER NOT NULL,
  risk_level TEXT NOT NULL,
  approval_policy TEXT NOT NULL,
  state TEXT NOT NULL,
  approval_expires_at TIMESTAMPTZ NOT NULL,
  warning_acknowledged_at TIMESTAMPTZ,
  final_approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  confirmation_phrase_hash TEXT,
  critical_auth_method TEXT,
  critical_auth_result TEXT,
  superseded_by_request_id TEXT REFERENCES automation_approval_requests(id),
  warning_actor_id TEXT,
  final_actor_id TEXT,
  approval_channels TEXT[] NOT NULL DEFAULT ARRAY['in_app']::TEXT[],
  approval_result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS automation_approval_owner_state
  ON automation_approval_requests(owner_id, state, approval_expires_at);

CREATE TABLE IF NOT EXISTS automation_approval_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  approval_request_id TEXT NOT NULL REFERENCES automation_approval_requests(id),
  execution_id TEXT NOT NULL REFERENCES automation_executions(id),
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  safe_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_queue_jobs (
  id TEXT PRIMARY KEY,
  queue_name TEXT NOT NULL,
  job_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  execution_id TEXT REFERENCES automation_executions(id),
  step_run_id TEXT REFERENCES automation_step_runs(id),
  priority INTEGER NOT NULL DEFAULT 0,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'queued',
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  idempotency_key TEXT NOT NULL,
  locked_until TIMESTAMPTZ,
  worker_id TEXT,
  fencing_token BIGINT NOT NULL DEFAULT 0,
  safe_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  dead_letter_reason TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (queue_name, idempotency_key)
);

CREATE INDEX IF NOT EXISTS automation_queue_claim_order
  ON automation_queue_jobs(queue_name, status, priority DESC, next_run_at, created_at);

CREATE TABLE IF NOT EXISTS automation_queue_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  queue_job_id TEXT NOT NULL REFERENCES automation_queue_jobs(id),
  event_type TEXT NOT NULL,
  worker_id TEXT,
  fencing_token BIGINT,
  safe_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_notification_outbox (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  approval_request_id TEXT REFERENCES automation_approval_requests(id),
  event_id TEXT,
  channel TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  safe_payload JSONB NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  worker_id TEXT,
  provider_receipt_id TEXT,
  sent_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dedupe_key)
);

CREATE TABLE IF NOT EXISTS automation_notification_inbox (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  provider_receipt_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  safe_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processing_result TEXT,
  UNIQUE (channel, provider_receipt_id),
  UNIQUE (dedupe_key)
);

CREATE TABLE IF NOT EXISTS integration_connections (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  provider_workspace_id TEXT,
  account_label TEXT,
  account_email TEXT,
  token_ciphertext TEXT,
  refresh_token_ciphertext TEXT,
  token_key_version INTEGER,
  expires_at TIMESTAMPTZ,
  granted_scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL,
  connected_at TIMESTAMPTZ,
  refreshed_at TIMESTAMPTZ,
  validated_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  disconnect_actor_id TEXT,
  disconnect_reason TEXT,
  revoke_result TEXT,
  refresh_locked_until TIMESTAMPTZ,
  refresh_worker_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_connections_active_identity
  ON integration_connections(owner_id, app_id, provider, provider_account_id, COALESCE(provider_workspace_id, ''))
  WHERE status NOT IN ('disconnected', 'revoked');

CREATE TABLE IF NOT EXISTS oauth_authorization_sessions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  app_id TEXT NOT NULL,
  service_id TEXT,
  state_hash TEXT NOT NULL UNIQUE,
  pkce_verifier_ciphertext TEXT,
  requested_scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  redirect_uri TEXT NOT NULL,
  return_target TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE oauth_authorization_sessions ADD COLUMN IF NOT EXISTS service_id TEXT;

CREATE TABLE IF NOT EXISTS integration_connection_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  connection_id TEXT NOT NULL REFERENCES integration_connections(id),
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  safe_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_audit_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  user_id TEXT,
  approver_id TEXT,
  workflow_id TEXT,
  execution_id TEXT,
  step_run_id TEXT,
  action_id TEXT,
  risk_level TEXT,
  warning_acknowledged_at TIMESTAMPTZ,
  final_approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  approved_input_hash TEXT,
  actual_input_hash TEXT,
  approval_channels TEXT[],
  approval_result TEXT,
  execution_result TEXT,
  safe_connection_identity JSONB,
  safe_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION automation_reject_append_only_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'append-only automation history cannot be changed';
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  table_name TEXT;
  trigger_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'automation_workflow_versions',
    'automation_action_snapshots',
    'automation_execution_events',
    'automation_approval_events',
    'automation_queue_events',
    'integration_connection_events',
    'automation_audit_events'
  ] LOOP
    trigger_name := table_name || '_append_only';
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = trigger_name) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION automation_reject_append_only_mutation()',
        trigger_name,
        table_name
      );
    END IF;
  END LOOP;
END;
$$;
`;

let schemaReady: Promise<void> | null = null;

export async function ensureAutomationRuntimeSchema() {
  if (!hasPostgresStorage()) throw new AutomationRuntimeConfigurationError();
  schemaReady ??= getPostgres().unsafe(AUTOMATION_RUNTIME_SCHEMA_SQL).then(() => undefined).catch((error) => {
    schemaReady = null;
    throw error;
  });
  await schemaReady;
}

export function resetAutomationRuntimeSchemaForTests() {
  schemaReady = null;
}
