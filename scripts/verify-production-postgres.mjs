import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

if (!process.env.DATABASE_URL?.trim()) {
  console.error("[postgres-production] DATABASE_URL is required; no database verification was run.");
  process.exit(2);
}

const require = createRequire(import.meta.url);
require("sucrase/register/ts");
const moduleLoader = require("node:module");
const originalResolve = moduleLoader._resolveFilename;
moduleLoader._resolveFilename = function resolveProjectAlias(request, parent, isMain, options) {
  const mapped = request.startsWith("@/") ? path.join(process.cwd(), request.slice(2)) : request;
  return originalResolve.call(this, mapped, parent, isMain, options);
};

const load = (relativePath) => require(path.join(process.cwd(), relativePath));
const admin = load("src/lib/admin/schema.ts");
const auth = load("src/lib/auth/auth-security.schema.ts");
const automation = load("src/lib/automation/runtime/schema.ts");
const billing = load("src/lib/billing/billing-schema.ts");
const devices = load("src/lib/devices/device.schema.ts");
const revenue = load("src/lib/business/revenue.schema.ts");
const { getPostgres, closePostgresForTests } = load("src/lib/db/postgres.ts");

const schemas = [
  [admin.ensureAdminSchema, admin.ADMIN_SCHEMA_SQL],
  [auth.ensureAuthSecuritySchema, auth.AUTH_SECURITY_SCHEMA_SQL],
  [automation.ensureAutomationRuntimeSchema, automation.AUTOMATION_RUNTIME_SCHEMA_SQL],
  [billing.ensureBillingSchema, billing.BILLING_SCHEMA_SQL],
  [devices.ensureDeviceSchema, devices.DEVICE_SCHEMA_SQL],
  [revenue.ensureRevenueSchema, revenue.REVENUE_SCHEMA_SQL]
];
const expectedTables = [...new Set(schemas.flatMap(([, sql]) =>
  [...String(sql).matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)/giu)].map((match) => match[1])
))].sort();
const sentinel = `production-verify-${randomUUID()}`;

try {
  for (const [ensure] of schemas) await ensure();
  const sql = getPostgres();
  const metadata = await sql`
    SELECT current_database() AS database_name,
           current_setting('server_version_num')::int AS version_number,
           current_setting('transaction_read_only') AS read_only
  `;
  if (Number(metadata[0]?.version_number) < 140000) throw new Error("PostgreSQL 14 or newer is required.");
  if (String(metadata[0]?.read_only) !== "off") throw new Error("DATABASE_URL points to a read-only database.");

  const tableRows = await sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename IN ${sql(expectedTables)}
  `;
  const found = new Set(tableRows.map((row) => String(row.tablename)));
  const missing = expectedTables.filter((table) => !found.has(table));
  if (missing.length) throw new Error(`Missing production tables: ${missing.join(", ")}`);

  const requiredAppendOnlyTables = [
    "admin_audit_events", "auth_security_audit_events", "device_audit_events",
    "revenue_audit_events", "billing_events", "automation_execution_events",
    "automation_approval_events", "automation_queue_events", "integration_connection_events"
  ];
  const triggerRows = await sql`
    SELECT DISTINCT c.relname AS table_name
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema() AND NOT t.tgisinternal
      AND c.relname IN ${sql(requiredAppendOnlyTables)}
  `;
  const protectedTables = new Set(triggerRows.map((row) => String(row.table_name)));
  const unprotected = requiredAppendOnlyTables.filter((table) => !protectedTables.has(table));
  if (unprotected.length) throw new Error(`Append-only trigger missing: ${unprotected.join(", ")}`);

  try {
    await sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtext(${sentinel}))`;
      await transaction`
        INSERT INTO device_audit_events (id, owner_id, action, safe_metadata)
        VALUES (${sentinel}, ${sentinel}, 'production.verify.rollback', ${transaction.json({ sentinel: true })})
      `;
      throw new Error("ROLLBACK_SENTINEL");
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "ROLLBACK_SENTINEL") throw error;
  }
  const residue = await sql`SELECT COUNT(*)::int AS count FROM device_audit_events WHERE id = ${sentinel}`;
  if (Number(residue[0]?.count) !== 0) throw new Error("Transaction rollback left verification data behind.");

  console.log(`[postgres-production] ok database=${metadata[0].database_name} tables=${expectedTables.length} append_only=${requiredAppendOnlyTables.length} rollback=ok`);
} finally {
  await closePostgresForTests();
}
