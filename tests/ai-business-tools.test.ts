import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildBusinessAiContext,
  detectBusinessQuestion,
  maskEmail,
  maskPhone
} from "../src/lib/ai/business-tools";
import { createCustomerDraft } from "../src/lib/crm/crm.repository";
import {
  createErpExpense,
  createErpInvoice,
  createErpProduct,
  recordErpPayment
} from "../src/lib/erp/erp.repository";

const NOW = new Date("2026-07-16T12:00:00.000Z");

test("business question detection matches finance, CRM and ERP intents", () => {
  assert.ok(detectBusinessQuestion("이번 달 매출은 얼마야?"));
  assert.ok(detectBusinessQuestion("미수금이 가장 많은 고객은 누구야?"));
  assert.ok(detectBusinessQuestion("재고가 부족한 상품을 알려줘"));
  assert.ok(detectBusinessQuestion("연체된 청구서 목록을 보여줘"));
  assert.ok(detectBusinessQuestion("show me outstanding invoices"));
  assert.ok(!detectBusinessQuestion("파이썬에서 리스트를 정렬하는 방법 알려줘"));
  assert.ok(!detectBusinessQuestion("오늘 날씨 어때?"));
});

test("business AI context aggregates exact owner-scoped numbers", async () => {
  await withTempDataDir(async () => {
    const invoice = await createErpInvoice({
      ownerId: "alice",
      customerName: "ABC 주식회사",
      items: [{ productName: "컨설팅", quantity: 1, unitPrice: 5_000_000 }],
      dueAt: "2026-07-10T00:00:00.000Z"
    });
    await recordErpPayment({
      ownerId: "alice",
      invoiceId: invoice.id,
      amount: 2_000_000,
      paidAt: "2026-07-05T00:00:00.000Z"
    });
    await createErpExpense({
      ownerId: "alice",
      amount: 700_000,
      spentAt: "2026-07-06T00:00:00.000Z",
      memo: "서버 비용"
    });
    await createErpProduct({
      ownerId: "alice",
      name: "부족상품",
      unitPrice: 10_000,
      stockQuantity: 1,
      lowStockThreshold: 5
    });

    const context = await buildBusinessAiContext("alice", "이번 달 매출은 얼마야?", NOW);
    assert.ok(context.detected);
    assert.match(context.contextText, /2,000,000원/u);
    assert.match(context.contextText, /700,000원/u);
    assert.match(context.contextText, /1,300,000원/u);
    assert.match(context.contextText, /3,000,000원/u);
    assert.match(context.contextText, /연체/u);
    assert.match(context.contextText, /부족상품/u);
    assert.match(context.contextText, /다시 계산하거나 추정하지 말고/u);
    assert.equal(context.sources.length, 1);
    assert.equal(context.sources[0].path, "business://summary");

    const otherOwner = await buildBusinessAiContext("bob", "이번 달 매출은 얼마야?", NOW);
    assert.ok(otherOwner.detected);
    assert.match(otherOwner.contextText, /이번 달 매출: 0원/u);
    assert.doesNotMatch(otherOwner.contextText, /ABC 주식회사/u);
  });
});

test("customer name match includes masked contact details", async () => {
  await withTempDataDir(async () => {
    await createCustomerDraft({
      ownerId: "alice",
      name: "홍길동",
      email: "hong@example.com",
      phone: "010-1234-5678",
      companyName: "ABC 주식회사",
      position: "대표"
    });

    const context = await buildBusinessAiContext(
      "alice",
      "홍길동 고객과 진행한 거래를 알려줘",
      NOW
    );
    assert.match(context.contextText, /홍길동/u);
    assert.match(context.contextText, /h\*\*\*@example\.com/u);
    assert.match(context.contextText, /010-\*\*\*\*-5678/u);
    assert.doesNotMatch(context.contextText, /hong@example\.com/u);
  });
});

test("non-business questions skip CRM and ERP loading entirely", async () => {
  const context = await buildBusinessAiContext("alice", "리액트 useEffect 설명해줘", NOW);
  assert.equal(context.detected, false);
  assert.equal(context.contextText, "");
  assert.equal(context.sources.length, 0);
});

test("PII masking helpers keep only safe fragments", () => {
  assert.equal(maskEmail("hong@example.com"), "h***@example.com");
  assert.equal(maskEmail(""), "-");
  assert.equal(maskPhone("010-1234-5678"), "010-****-5678");
  assert.equal(maskPhone(""), "-");
});

async function withTempDataDir(run: () => Promise<void>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-biz-ai-"));
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
