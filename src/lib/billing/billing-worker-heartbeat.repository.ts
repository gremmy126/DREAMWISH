import { getPostgres } from "../db/postgres";
import { ensureBillingSchema } from "./billing-schema";

export async function registerBillingWorker(workerId: string, version: string) {
  await ensureBillingSchema();
  await getPostgres()`
    INSERT INTO billing_worker_heartbeats (worker_id, version, started_at, last_seen_at, stopped_at)
    VALUES (${workerId}, ${version}, NOW(), NOW(), NULL)
    ON CONFLICT (worker_id) DO UPDATE SET version = EXCLUDED.version, started_at = NOW(), last_seen_at = NOW(), stopped_at = NULL
  `;
}

export async function heartbeatBillingWorker(workerId: string) {
  await ensureBillingSchema();
  await getPostgres()`UPDATE billing_worker_heartbeats SET last_seen_at = NOW() WHERE worker_id = ${workerId} AND stopped_at IS NULL`;
}

export async function stopBillingWorker(workerId: string) {
  await ensureBillingSchema();
  await getPostgres()`UPDATE billing_worker_heartbeats SET last_seen_at = NOW(), stopped_at = NOW() WHERE worker_id = ${workerId}`;
}

export async function getBillingWorkerHealth() {
  await ensureBillingSchema();
  const rows = await getPostgres()`
    SELECT version, last_seen_at, stopped_at FROM billing_worker_heartbeats
    ORDER BY last_seen_at DESC LIMIT 1
  `;
  if (!rows[0]) return { status: "offline" as const, lastSeenAt: null, version: null };
  const lastSeenAt = new Date(rows[0].last_seen_at as Date | string);
  const healthy = !rows[0].stopped_at && Date.now() - lastSeenAt.getTime() <= 30_000;
  return { status: healthy ? "healthy" as const : "offline" as const, lastSeenAt: lastSeenAt.toISOString(), version: String(rows[0].version) };
}

