import { createHash, randomUUID } from "node:crypto";
import { getPostgres } from "../../db/postgres";
import type { AutomationScenario } from "../scenario-designer";
import { ensureAutomationRuntimeSchema } from "./schema";
import type { ApprovalPolicy } from "./types";
import { getActionDefinition } from "../registry/action-registry";
import type { ActionDefinition } from "../registry/action.types";

export type RuntimeWorkflow = {
  id: string;
  ownerId: string;
  name: string;
  status: string;
  currentVersion: number;
  activeVersion: number | null;
  approvalPolicy: ApprovalPolicy;
  approvalExpiryMinutes: number;
  notificationChannels: string[];
  criticalAuthMethod: "password" | "otp" | "admin" | null;
};

export async function createRuntimeWorkflow(input: {
  ownerId: string;
  name: string;
  approvalPolicy?: ApprovalPolicy;
  approvalExpiryMinutes?: number;
  notificationChannels?: string[];
  criticalAuthMethod?: "password" | "otp" | "admin" | null;
}) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const id = randomUUID();
  const rows = await sql`
    INSERT INTO automation_workflows (
      id, owner_id, name, approval_policy, approval_expiry_minutes, notification_channels, critical_auth_policy
    ) VALUES (
      ${id}, ${input.ownerId}, ${input.name}, ${input.approvalPolicy || "high_risk_two_stage"},
      ${normalizeExpiry(input.approvalExpiryMinutes)}, ${input.notificationChannels || ["in_app"]},
      ${normalizeCriticalAuth(input.criticalAuthMethod)}
    ) RETURNING *
  `;
  return mapWorkflow(rows[0]!);
}

export async function ensureRuntimeWorkflow(input: {
  ownerId: string;
  workflowId: string;
  name: string;
  approvalPolicy?: ApprovalPolicy;
  approvalExpiryMinutes?: number;
  notificationChannels?: string[];
  criticalAuthMethod?: "password" | "otp" | "admin" | null;
}) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    INSERT INTO automation_workflows (
      id, owner_id, name, approval_policy, approval_expiry_minutes, notification_channels, critical_auth_policy
    ) VALUES (
      ${input.workflowId}, ${input.ownerId}, ${input.name}, ${input.approvalPolicy || "high_risk_two_stage"},
      ${normalizeExpiry(input.approvalExpiryMinutes)}, ${input.notificationChannels || ["in_app"]},
      ${normalizeCriticalAuth(input.criticalAuthMethod)}
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      approval_policy = EXCLUDED.approval_policy,
      approval_expiry_minutes = EXCLUDED.approval_expiry_minutes,
      notification_channels = EXCLUDED.notification_channels,
      critical_auth_policy = EXCLUDED.critical_auth_policy,
      updated_at = NOW()
    WHERE automation_workflows.owner_id = ${input.ownerId}
    RETURNING *
  `;
  if (!rows[0]) throw new Error("Workflow identity belongs to another owner.");
  return mapWorkflow(rows[0]);
}

export async function getRuntimeWorkflow(ownerId: string, workflowId: string) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    SELECT * FROM automation_workflows
    WHERE owner_id = ${ownerId} AND id = ${workflowId}
    LIMIT 1
  `;
  return rows[0] ? mapWorkflow(rows[0]) : null;
}

export async function saveWorkflowVersion(
  ownerId: string,
  workflowId: string,
  scenario: AutomationScenario,
  createdBy: string
) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const normalized = stableJson(scenario);
  const contentHash = createHash("sha256").update(normalized).digest("hex");
  return sql.begin(async (transaction) => {
    const workflowRows = await transaction`
      SELECT current_version FROM automation_workflows
      WHERE owner_id = ${ownerId} AND id = ${workflowId}
      FOR UPDATE
    `;
    if (!workflowRows[0]) throw new Error("Automation workflow was not found.");
    const existing = await transaction`
      SELECT version FROM automation_workflow_versions
      WHERE owner_id = ${ownerId} AND workflow_id = ${workflowId} AND content_hash = ${contentHash}
      LIMIT 1
    `;
    if (existing[0]) {
      const existingVersion = Number(existing[0].version);
      for (const node of scenario.nodes) {
        const definition = node.actionId && node.actionVersion
          ? getActionDefinition(node.appId, node.actionId, node.actionVersion)
          : null;
        if (!definition) continue;
        const definitionJson = stableJson(definition);
        await transaction`
          INSERT INTO automation_action_snapshots (
            app_id, action_id, action_version, adapter_key, adapter_version,
            output_schema_version, definition_json, definition_hash
          ) VALUES (
            ${definition.appId}, ${definition.id}, ${definition.version}, ${definition.adapterKey},
            ${definition.adapterVersion}, ${definition.outputSchemaVersion},
            ${transaction.json(JSON.parse(definitionJson) as never)},
            ${createHash("sha256").update(definitionJson).digest("hex")}
          ) ON CONFLICT (app_id, action_id, action_version, adapter_version) DO NOTHING
        `;
        await transaction`
          UPDATE automation_nodes
          SET adapter_key = COALESCE(adapter_key, ${definition.adapterKey}),
              adapter_version = COALESCE(adapter_version, ${definition.adapterVersion})
          WHERE owner_id = ${ownerId} AND workflow_id = ${workflowId}
            AND workflow_version = ${existingVersion} AND node_id = ${node.id}
        `;
      }
      return { version: existingVersion, contentHash, created: false };
    }
    const version = Number(workflowRows[0].current_version || 0) + 1;
    await transaction`
      INSERT INTO automation_workflow_versions (
        workflow_id, owner_id, version, workflow_snapshot, content_hash, created_by
      ) VALUES (
        ${workflowId}, ${ownerId}, ${version}, ${transaction.json(JSON.parse(normalized) as never)},
        ${contentHash}, ${createdBy}
      )
    `;
    for (const node of scenario.nodes) {
      const definition = node.actionId && node.actionVersion
        ? getActionDefinition(node.appId, node.actionId, node.actionVersion)
        : null;
      if (node.appId !== "filter" && node.actionId && !definition) {
        throw new Error(`ActionDefinition ${node.appId}.${node.actionId}@${node.actionVersion} is unavailable.`);
      }
      if (definition) {
        const definitionJson = stableJson(definition);
        const definitionHash = createHash("sha256").update(definitionJson).digest("hex");
        await transaction`
          INSERT INTO automation_action_snapshots (
            app_id, action_id, action_version, adapter_key, adapter_version,
            output_schema_version, definition_json, definition_hash
          ) VALUES (
            ${definition.appId}, ${definition.id}, ${definition.version}, ${definition.adapterKey},
            ${definition.adapterVersion}, ${definition.outputSchemaVersion},
            ${transaction.json(JSON.parse(definitionJson) as never)}, ${definitionHash}
          )
          ON CONFLICT (app_id, action_id, action_version, adapter_version) DO NOTHING
        `;
      }
      await transaction`
        INSERT INTO automation_nodes (
          workflow_id, workflow_version, owner_id, node_id, app_id, action_id,
          action_version, adapter_key, adapter_version, integration_connection_id, input_json, position
        ) VALUES (
          ${workflowId}, ${version}, ${ownerId}, ${node.id}, ${node.appId}, ${node.actionId || null},
          ${node.actionVersion || null}, ${definition?.adapterKey || null}, ${definition?.adapterVersion || null},
          ${node.credentialId || null},
          ${transaction.json(node.config as never)}, ${transaction.json(node.position as never)}
        )
      `;
    }
    for (const [orderIndex, edge] of scenario.edges.entries()) {
      await transaction`
        INSERT INTO automation_edges (
          workflow_id, workflow_version, owner_id, edge_id, source_node_id,
          target_node_id, order_index
        ) VALUES (
          ${workflowId}, ${version}, ${ownerId}, ${edge.id}, ${edge.source}, ${edge.target}, ${orderIndex}
        )
      `;
    }
    await transaction`
      UPDATE automation_workflows
      SET current_version = ${version}, name = ${scenario.name}, updated_at = NOW()
      WHERE owner_id = ${ownerId} AND id = ${workflowId}
    `;
    return { version, contentHash, created: true };
  });
}

export async function getPinnedWorkflowActionDefinition(input: {
  ownerId: string;
  workflowId: string;
  workflowVersion: number;
  nodeId: string;
}): Promise<ActionDefinition | null> {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    SELECT snapshot.definition_json
    FROM automation_nodes AS node
    JOIN automation_action_snapshots AS snapshot
      ON snapshot.app_id = node.app_id
      AND snapshot.action_id = node.action_id
      AND snapshot.action_version = node.action_version
      AND snapshot.adapter_version = node.adapter_version
    WHERE node.owner_id = ${input.ownerId}
      AND node.workflow_id = ${input.workflowId}
      AND node.workflow_version = ${input.workflowVersion}
      AND node.node_id = ${input.nodeId}
    LIMIT 1
  `;
  return rows[0] ? structuredClone(rows[0].definition_json as ActionDefinition) : null;
}

export async function getWorkflowVersion<T = AutomationScenario>(ownerId: string, workflowId: string, version: number) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    SELECT workflow_snapshot, content_hash, created_at
    FROM automation_workflow_versions
    WHERE owner_id = ${ownerId} AND workflow_id = ${workflowId} AND version = ${version}
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return {
    version,
    snapshot: structuredClone(rows[0].workflow_snapshot as T),
    contentHash: String(rows[0].content_hash),
    createdAt: new Date(rows[0].created_at as Date | string).toISOString()
  };
}

export async function activateWorkflowVersion(ownerId: string, workflowId: string, version: number) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    UPDATE automation_workflows AS workflow
    SET active_version = ${version}, status = 'active', updated_at = NOW()
    WHERE workflow.owner_id = ${ownerId}
      AND workflow.id = ${workflowId}
      AND EXISTS (
        SELECT 1 FROM automation_workflow_versions AS version_row
        WHERE version_row.owner_id = ${ownerId}
          AND version_row.workflow_id = ${workflowId}
          AND version_row.version = ${version}
      )
    RETURNING workflow.*
  `;
  if (!rows[0]) throw new Error("Workflow version was not found or is not owned by this user.");
  return mapWorkflow(rows[0]);
}

export async function pauseRuntimeWorkflow(ownerId: string, workflowId: string) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    UPDATE automation_workflows
    SET status = 'paused', updated_at = NOW()
    WHERE owner_id = ${ownerId} AND id = ${workflowId}
    RETURNING *
  `;
  return rows[0] ? mapWorkflow(rows[0]) : null;
}

function mapWorkflow(row: Record<string, unknown>): RuntimeWorkflow {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: String(row.name),
    status: String(row.status),
    currentVersion: Number(row.current_version),
    activeVersion: row.active_version === null ? null : Number(row.active_version),
    approvalPolicy: String(row.approval_policy) as ApprovalPolicy,
    approvalExpiryMinutes: Number(row.approval_expiry_minutes),
    notificationChannels: Array.isArray(row.notification_channels) ? row.notification_channels.map(String) : [],
    criticalAuthMethod: ["password", "otp", "admin"].includes(String(row.critical_auth_policy))
      ? String(row.critical_auth_policy) as "password" | "otp" | "admin"
      : null
  };
}

function normalizeExpiry(value?: number) {
  return [5, 15, 30, 60, 1440].includes(Number(value)) ? Number(value) : 30;
}

function normalizeCriticalAuth(value?: "password" | "otp" | "admin" | null) {
  return value && ["password", "otp", "admin"].includes(value) ? value : null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
