import { getPostgres } from "../../db/postgres";
import { ensureAutomationRuntimeSchema } from "../runtime/schema";

export const AUTOMATION_WORKER_VERSION = "1.0.0";
export const AUTOMATION_WORKER_CAPABILITIES = ["automation", "notifications", "approvals"] as const;
export const WORKER_HEARTBEAT_INTERVAL_MS = 10_000;
export const WORKER_FRESHNESS_MS = 30_000;

export type AutomationWorkerHeartbeat = {
  workerId: string;
  version: string;
  capabilities: string[];
  startedAt: string;
  lastSeenAt: string;
  stoppedAt: string | null;
};

export type AutomationWorkerHealth = {
  configured: boolean;
  status: "not_configured" | "offline" | "healthy";
  lastSeenAt: string | null;
  lastSeenAgeSeconds: number | null;
  version: string | null;
  versionCompatible: boolean | null;
  capabilities: string[];
};

export function isAutomationWorkerConfigured() {
  return Boolean(
    process.env.DATABASE_URL?.trim() && (
      process.env.AUTOMATION_CREDENTIAL_ENCRYPTION_KEY?.trim() ||
      process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY?.trim() ||
      process.env.OAUTH_TOKEN_ENCRYPTION_KEY?.trim()
    )
  );
}

export function filterFreshCompatibleWorkers(
  records: readonly AutomationWorkerHeartbeat[],
  capability: string,
  now = new Date()
) {
  const cutoff = now.getTime() - WORKER_FRESHNESS_MS;
  return records.filter((record) =>
    record.stoppedAt === null &&
    new Date(record.lastSeenAt).getTime() >= cutoff &&
    record.capabilities.includes(capability) &&
    isCompatibleVersion(record.version)
  );
}

export function deriveAutomationWorkerHealth(input: {
  configured: boolean;
  records: readonly AutomationWorkerHeartbeat[];
  now?: Date;
}): AutomationWorkerHealth {
  if (!input.configured) {
    return {
      configured: false,
      status: "not_configured",
      lastSeenAt: null,
      lastSeenAgeSeconds: null,
      version: null,
      versionCompatible: null,
      capabilities: []
    };
  }
  const now = input.now || new Date();
  const running = input.records.filter((record) => record.stoppedAt === null);
  const latest = [...running, ...input.records.filter((record) => record.stoppedAt !== null)]
    .sort((left, right) => new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime())[0] || null;
  const healthy = filterFreshCompatibleWorkers(running, "automation", now)
    .sort((left, right) => new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime())[0] || null;
  const selected = healthy || latest;
  return {
    configured: true,
    status: healthy ? "healthy" : "offline",
    lastSeenAt: selected?.lastSeenAt || null,
    lastSeenAgeSeconds: selected
      ? Math.max(0, Math.floor((now.getTime() - new Date(selected.lastSeenAt).getTime()) / 1_000))
      : null,
    version: selected?.version || null,
    versionCompatible: selected ? isCompatibleVersion(selected.version) : null,
    capabilities: selected ? [...selected.capabilities] : []
  };
}

export async function registerWorkerHeartbeat(input: {
  workerId: string;
  version?: string;
  capabilities?: readonly string[];
  now?: Date;
}) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const now = input.now || new Date();
  const capabilities = [...(input.capabilities || AUTOMATION_WORKER_CAPABILITIES)];
  const rows = await sql`
    INSERT INTO automation_worker_heartbeats (
      worker_id, version, capabilities, started_at, last_seen_at, stopped_at
    ) VALUES (
      ${input.workerId}, ${input.version || AUTOMATION_WORKER_VERSION}, ${sql.json(capabilities as never)}, ${now}, ${now}, NULL
    )
    ON CONFLICT (worker_id) DO UPDATE SET
      version = EXCLUDED.version,
      capabilities = EXCLUDED.capabilities,
      started_at = EXCLUDED.started_at,
      last_seen_at = EXCLUDED.last_seen_at,
      stopped_at = NULL
    RETURNING *
  `;
  return mapHeartbeat(rows[0]!);
}

export async function updateWorkerHeartbeat(input: {
  workerId: string;
  version?: string;
  capabilities?: readonly string[];
  now?: Date;
}) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    UPDATE automation_worker_heartbeats
    SET version = ${input.version || AUTOMATION_WORKER_VERSION},
        capabilities = ${sql.json([...(input.capabilities || AUTOMATION_WORKER_CAPABILITIES)] as never)},
        last_seen_at = ${input.now || new Date()},
        stopped_at = NULL
    WHERE worker_id = ${input.workerId}
    RETURNING *
  `;
  return rows[0] ? mapHeartbeat(rows[0]) : registerWorkerHeartbeat(input);
}

export async function stopWorkerHeartbeat(workerId: string, now = new Date()) {
  await ensureAutomationRuntimeSchema();
  const rows = await getPostgres()`
    UPDATE automation_worker_heartbeats
    SET last_seen_at = ${now}, stopped_at = ${now}
    WHERE worker_id = ${workerId}
    RETURNING *
  `;
  return rows[0] ? mapHeartbeat(rows[0]) : null;
}

export async function listFreshCompatibleWorkers(capability: string, now = new Date()) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const cutoff = new Date(now.getTime() - WORKER_FRESHNESS_MS);
  const rows = await sql`
    SELECT * FROM automation_worker_heartbeats
    WHERE stopped_at IS NULL
      AND last_seen_at >= ${cutoff}
      AND capabilities ? ${capability}
    ORDER BY last_seen_at DESC
  `;
  return filterFreshCompatibleWorkers(rows.map(mapHeartbeat), capability, now);
}

export async function getAutomationWorkerHealth(now = new Date()) {
  const configured = isAutomationWorkerConfigured();
  if (!configured) return deriveAutomationWorkerHealth({ configured, records: [], now });
  await ensureAutomationRuntimeSchema();
  const rows = await getPostgres()`
    SELECT * FROM automation_worker_heartbeats
    ORDER BY last_seen_at DESC
    LIMIT 20
  `;
  return deriveAutomationWorkerHealth({ configured, records: rows.map(mapHeartbeat), now });
}

function isCompatibleVersion(version: string) {
  return version.split(".")[0] === AUTOMATION_WORKER_VERSION.split(".")[0];
}

function mapHeartbeat(row: Record<string, unknown>): AutomationWorkerHeartbeat {
  return {
    workerId: String(row.worker_id),
    version: String(row.version),
    capabilities: Array.isArray(row.capabilities) ? row.capabilities.map(String) : [],
    startedAt: new Date(row.started_at as Date | string).toISOString(),
    lastSeenAt: new Date(row.last_seen_at as Date | string).toISOString(),
    stoppedAt: row.stopped_at ? new Date(row.stopped_at as Date | string).toISOString() : null
  };
}
