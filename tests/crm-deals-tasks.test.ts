import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createCrmDeal,
  createCrmTask,
  createCustomerDraft,
  deleteCrmDeal,
  deleteCrmTask,
  listCrmDeals,
  listCrmTasks,
  updateCrmDeal,
  updateCrmTask
} from "../src/lib/crm/crm.repository";

test("CRM deals support stage moves, won/lost handling and owner isolation", async () => {
  await withTempDataDir(async () => {
    const customer = await createCustomerDraft({
      ownerId: "alice",
      name: "딜 고객",
      email: "deal@example.com",
      phone: "",
      companyName: "ABC",
      position: ""
    });
    const deal = await createCrmDeal({
      ownerId: "alice",
      customerId: customer.id,
      title: "웹사이트 구축",
      value: 5_000_000,
      probability: 40
    });
    assert.ok(deal);
    assert.equal(deal!.stage, "discovery");

    const moved = await updateCrmDeal("alice", deal!.id, { stage: "negotiation" });
    assert.equal(moved?.stage, "negotiation");

    const won = await updateCrmDeal("alice", deal!.id, { stage: "won" });
    assert.equal(won?.probability, 100);

    assert.equal(await updateCrmDeal("bob", deal!.id, { stage: "lost" }), null);
    assert.equal(await deleteCrmDeal("bob", deal!.id), false);
    assert.equal((await listCrmDeals("alice")).length, 1);
    assert.equal(await deleteCrmDeal("alice", deal!.id), true);
    assert.equal((await listCrmDeals("alice")).length, 0);

    assert.equal(
      await createCrmDeal({ ownerId: "bob", customerId: customer.id, title: "탈취 시도" }),
      null
    );
  });
});

test("CRM tasks complete, reopen and stay owner scoped", async () => {
  await withTempDataDir(async () => {
    const customer = await createCustomerDraft({
      ownerId: "alice",
      name: "업무 고객",
      email: "",
      phone: "",
      companyName: "",
      position: ""
    });
    const task = await createCrmTask({
      ownerId: "alice",
      customerId: customer.id,
      title: "제안서 발송",
      dueAt: "2026-07-20T00:00:00.000Z"
    });
    assert.ok(task);
    assert.equal(task!.completedAt, null);

    const completed = await updateCrmTask("alice", task!.id, { completed: true });
    assert.ok(completed?.completedAt);
    const reopened = await updateCrmTask("alice", task!.id, { completed: false });
    assert.equal(reopened?.completedAt, null);

    assert.equal(await updateCrmTask("bob", task!.id, { completed: true }), null);
    assert.equal(await deleteCrmTask("bob", task!.id), false);
    assert.equal((await listCrmTasks("alice")).length, 1);
    assert.equal(await deleteCrmTask("alice", task!.id), true);
  });
});

test("CRM deal and task routes derive owner identity", () => {
  for (const route of ["app/api/crm/deals/route.ts", "app/api/crm/tasks/route.ts"]) {
    const source = fs.readFileSync(route, "utf8");
    assert.match(source, /requireOwnerContext\(request\)/u);
    assert.match(source, /owner\.uid/u);
  }
});

async function withTempDataDir(run: () => Promise<void>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-crm-deals-"));
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
