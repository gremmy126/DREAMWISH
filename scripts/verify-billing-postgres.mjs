import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

if (!process.env.DATABASE_URL?.trim()) {
  console.error("[billing-postgres] DATABASE_URL is required; external PostgreSQL verification was not run.");
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

const { ensureBillingSchema } = require(path.join(process.cwd(), "src/lib/billing/billing-schema.ts"));
const { getPostgres, closePostgresForTests } = require(path.join(process.cwd(), "src/lib/db/postgres.ts"));
const requiredTables = [
  "billing_payment_attempts",
  "billing_methods",
  "billing_subscriptions",
  "billing_charge_jobs",
  "billing_webhook_inbox",
  "billing_refund_requests",
  "billing_worker_heartbeats"
];
const sentinel = `billing-verify-${randomUUID()}`;

try {
  await ensureBillingSchema();
  const sql = getPostgres();
  const tables = await sql`
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename IN ${sql(requiredTables)}
  `;
  const found = new Set(tables.map((row) => String(row.tablename)));
  const missing = requiredTables.filter((table) => !found.has(table));
  if (missing.length) throw new Error(`Missing billing tables: ${missing.join(", ")}`);

  try {
    await sql.begin(async (transaction) => {
      await transaction`
        INSERT INTO billing_payment_attempts (
          id, owner_id, provider, environment, purpose, status, idempotency_key,
          provider_payment_id, expected_amount, currency, order_name
        ) VALUES (
          ${sentinel}, ${sentinel}, 'portone_kpn_v2', 'sandbox', 'general', 'created',
          ${sentinel}, ${sentinel}, 1, 'KRW', 'ROLLBACK_SENTINEL'
        )
      `;
      throw new Error("ROLLBACK_SENTINEL");
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "ROLLBACK_SENTINEL") throw error;
  }
  const residue = await sql`SELECT COUNT(*)::int AS count FROM billing_payment_attempts WHERE id = ${sentinel}`;
  if (Number(residue[0]?.count) !== 0) throw new Error("Billing transaction rollback left test data behind.");
  console.log(`[billing-postgres] ok tables=${requiredTables.length} rollback=ok`);
} finally {
  await closePostgresForTests();
}
