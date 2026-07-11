import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createCustomerDraft,
  listCrmActivities,
  listCrmAuditEvents,
  listCustomers,
  softDeleteCustomer,
  updateCustomer
} from "../src/lib/crm/crm.repository";
import { buildCustomerInsight } from "../src/lib/crm/crm-workspace";

test("CRM customers and activities are isolated by owner", async () => {
  await withTempDataDir(async () => {
    const alice = await createCustomerDraft({
      ownerId: "alice",
      name: "Alice Customer",
      email: "alice@example.com",
      phone: "010-1111-1111",
      companyName: "Alpha",
      position: "CEO",
      memo: "Asked for a proposal"
    });
    await createCustomerDraft({
      ownerId: "bob",
      name: "Bob Customer",
      email: "bob@example.com",
      phone: "010-2222-2222",
      companyName: "Beta",
      position: "CTO"
    });

    assert.deepEqual((await listCustomers("alice")).map((item) => item.id), [alice.id]);
    assert.equal((await listCrmActivities("alice")).length, 1);
    assert.equal((await listCrmActivities("bob")).length, 1);
  });
});

test("cross-owner CRM updates fail closed and soft delete is audited", async () => {
  await withTempDataDir(async () => {
    const customer = await createCustomerDraft({
      ownerId: "alice",
      name: "Protected Customer",
      email: "protected@example.com",
      phone: "",
      companyName: "Secure",
      position: "Manager"
    });

    assert.equal(await updateCustomer("bob", customer.id, { status: "active" }), null);
    assert.equal(await softDeleteCustomer("bob", customer.id), false);
    assert.equal(await softDeleteCustomer("alice", customer.id), true);
    assert.equal((await listCustomers("alice")).length, 0);
    assert.equal((await listCrmAuditEvents("alice"))[0]?.action, "customer.deleted");
  });
});

test("CRM insight explains risk contract probability and next action", async () => {
  await withTempDataDir(async () => {
    const customer = await createCustomerDraft({
      ownerId: "alice",
      name: "Priority Lead",
      email: "lead@example.com",
      phone: "010-3333-3333",
      companyName: "Gamma",
      position: "Director",
      memo: "Proposal requested"
    });
    const insight = buildCustomerInsight(customer, await listCrmActivities("alice", customer.id));
    assert.equal(insight.customerId, customer.id);
    assert.ok(insight.contractProbability >= 0 && insight.contractProbability <= 100);
    assert.ok(insight.riskScore >= 0 && insight.riskScore <= 100);
    assert.ok(insight.evidence.length > 0);
    assert.ok(insight.nextAction.length > 0);
  });
});

test("CRM route derives owner identity on every operation", () => {
  const source = fs.readFileSync("app/api/crm/customers/route.ts", "utf8");
  assert.match(source, /requireOwnerContext\(request\)/u);
  assert.match(source, /owner\.uid/u);
  assert.doesNotMatch(source, /export async function GET\(\)/u);
});

async function withTempDataDir(run: () => Promise<void>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-crm-"));
  const original = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  try {
    await run();
  } finally {
    if (original === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = original;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
