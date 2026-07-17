import { createHash } from "node:crypto";
import { getPostgres } from "../../db/postgres";
import { decryptToken, encryptToken } from "../../oauth/token-encryption";
import { ensureAutomationRuntimeSchema } from "./schema";

const MAX_TRIGGER_BYTES = 256 * 1024;

export async function saveExecutionTriggerPayload(
  ownerId: string,
  executionId: string,
  payload: Record<string, unknown>
) {
  await ensureAutomationRuntimeSchema();
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, "utf8") > MAX_TRIGGER_BYTES) {
    throw Object.assign(new Error("Trigger payload exceeds 256 KiB."), { code: "TRIGGER_PAYLOAD_TOO_LARGE", retryable: false });
  }
  const sql = getPostgres();
  await sql`
    INSERT INTO automation_execution_trigger_payloads (
      execution_id, owner_id, payload_ciphertext, payload_hash
    ) VALUES (
      ${executionId}, ${ownerId}, ${encryptToken(serialized)},
      ${createHash("sha256").update(serialized).digest("hex")}
    )
    ON CONFLICT (execution_id) DO NOTHING
  `;
}

export async function getExecutionTriggerPayload(ownerId: string, executionId: string) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    SELECT payload_ciphertext FROM automation_execution_trigger_payloads
    WHERE owner_id = ${ownerId} AND execution_id = ${executionId}
    LIMIT 1
  `;
  if (!rows[0]) return null;
  const parsed = JSON.parse(decryptToken(String(rows[0].payload_ciphertext))) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}
