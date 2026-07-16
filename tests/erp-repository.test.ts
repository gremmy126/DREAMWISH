import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createErpExpense,
  createErpInvoice,
  createErpOrder,
  createErpProduct,
  createErpProject,
  createErpVendor,
  fulfillErpOrder,
  listErpInventoryMovements,
  listErpInvoices,
  listErpPayments,
  listErpProducts,
  moveErpInventory,
  recordErpPayment,
  softDeleteErpEntity,
  updateErpEntity
} from "../src/lib/erp/erp.repository";

test("ERP records are isolated by owner", async () => {
  await withTempDataDir(async () => {
    await createErpProduct({ ownerId: "alice", name: "제품 A", unitPrice: 10000 });
    await createErpProduct({ ownerId: "bob", name: "제품 B", unitPrice: 20000 });
    await createErpVendor({ ownerId: "alice", name: "공급사 A" });

    assert.equal((await listErpProducts("alice")).length, 1);
    assert.equal((await listErpProducts("bob")).length, 1);
    assert.equal((await listErpProducts("alice"))[0].name, "제품 A");
  });
});

test("money fields reject floating point and negative values", async () => {
  await withTempDataDir(async () => {
    await assert.rejects(
      createErpProduct({ ownerId: "alice", name: "불량", unitPrice: 10.5 }),
      /integer/u
    );
    await assert.rejects(
      createErpExpense({ ownerId: "alice", amount: -100 }),
      /integer/u
    );
  });
});

test("order fulfillment deducts stock and records movement", async () => {
  await withTempDataDir(async () => {
    const product = await createErpProduct({
      ownerId: "alice",
      name: "노트북",
      unitPrice: 1_500_000,
      stockQuantity: 10
    });
    const order = await createErpOrder({
      ownerId: "alice",
      customerName: "ABC 주식회사",
      items: [{ productId: product.id, quantity: 3, unitPrice: 1_500_000 }]
    });
    assert.equal(order.totalAmount, 4_500_000);

    await fulfillErpOrder("alice", order.id);
    const [updated] = await listErpProducts("alice");
    assert.equal(updated.stockQuantity, 7);

    const movements = await listErpInventoryMovements("alice", product.id);
    assert.equal(movements[0].type, "out");
    assert.equal(movements[0].quantity, 3);
    assert.equal(movements[0].referenceId, order.id);
  });
});

test("purchase receipt increases stock and blocks over-withdrawal", async () => {
  await withTempDataDir(async () => {
    const product = await createErpProduct({
      ownerId: "alice",
      name: "모니터",
      unitPrice: 300_000,
      stockQuantity: 2
    });
    await moveErpInventory({ ownerId: "alice", productId: product.id, type: "in", quantity: 5 });
    const [afterIn] = await listErpProducts("alice");
    assert.equal(afterIn.stockQuantity, 7);

    await assert.rejects(
      moveErpInventory({ ownerId: "alice", productId: product.id, type: "out", quantity: 100 }),
      /stock/u
    );
    await assert.rejects(
      moveErpInventory({ ownerId: "bob", productId: product.id, type: "in", quantity: 1 }),
      /not found/u
    );
  });
});

test("invoice payment lifecycle: partial then full payment creates revenue ledger", async () => {
  await withTempDataDir(async () => {
    const invoice = await createErpInvoice({
      ownerId: "alice",
      customerName: "ABC 주식회사",
      items: [{ productName: "컨설팅", quantity: 1, unitPrice: 3_300_000 }],
      dueAt: "2026-07-10T00:00:00.000Z"
    });
    assert.equal(invoice.totalAmount, 3_300_000);
    assert.equal(invoice.status, "sent");

    const partial = await recordErpPayment({
      ownerId: "alice",
      invoiceId: invoice.id,
      amount: 1_000_000
    });
    assert.equal(partial.invoice.status, "partially_paid");
    assert.equal(partial.invoice.paidAmount, 1_000_000);

    await assert.rejects(
      recordErpPayment({ ownerId: "alice", invoiceId: invoice.id, amount: 99_999_999 }),
      /outstanding/u
    );

    const full = await recordErpPayment({
      ownerId: "alice",
      invoiceId: invoice.id,
      amount: 2_300_000
    });
    assert.equal(full.invoice.status, "paid");
    assert.ok(full.invoice.paidAt);

    const payments = await listErpPayments("alice");
    assert.equal(payments.length, 2);
    assert.equal(payments.reduce((total, item) => total + item.amount, 0), 3_300_000);
    assert.equal((await listErpPayments("bob")).length, 0);
  });
});

test("cross-owner ERP mutations fail closed", async () => {
  await withTempDataDir(async () => {
    const invoice = await createErpInvoice({
      ownerId: "alice",
      customerName: "기밀 고객",
      items: [{ productName: "서비스", quantity: 1, unitPrice: 500_000 }]
    });
    await assert.rejects(
      recordErpPayment({ ownerId: "bob", invoiceId: invoice.id, amount: 500_000 }),
      /not found/u
    );
    assert.equal(await softDeleteErpEntity("bob", "invoices", invoice.id), false);
    assert.equal(await softDeleteErpEntity("alice", "invoices", invoice.id), true);
    assert.equal((await listErpInvoices("alice")).length, 0);
  });
});

test("project and expense updates preserve identity fields", async () => {
  await withTempDataDir(async () => {
    const project = await createErpProject({
      ownerId: "alice",
      name: "웹사이트 구축",
      budgetAmount: 10_000_000
    });
    const updated = await updateErpEntity("alice", "projects", project.id, {
      status: "completed",
      ownerId: "mallory",
      id: "hijacked"
    });
    assert.equal(updated.ownerId, "alice");
    assert.equal(updated.id, project.id);
    assert.equal((updated as unknown as { status: string }).status, "completed");
  });
});

async function withTempDataDir(run: () => Promise<void>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-erp-"));
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
