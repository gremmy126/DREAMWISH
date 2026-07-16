"use client";

import { Package, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import { DeviceConnectionPanel } from "@/components/Business/DeviceConnectionPanel";
import { readApiResponse } from "@/src/lib/api/api-response";
import type { RevenueCandidate } from "@/src/lib/business/revenue.types";

type ErpTab =
  | "products"
  | "orders"
  | "invoices"
  | "payments"
  | "candidates"
  | "expenses"
  | "inventory"
  | "vendors"
  | "projects";

const TABS: Array<{ id: ErpTab; label: string }> = [
  { id: "products", label: "상품" },
  { id: "orders", label: "주문" },
  { id: "invoices", label: "청구서" },
  { id: "payments", label: "결제" },
  { id: "candidates", label: "매출 후보" },
  { id: "expenses", label: "지출" },
  { id: "inventory", label: "재고" },
  { id: "vendors", label: "공급업체" },
  { id: "projects", label: "프로젝트" }
];

type AnyRecord = Record<string, unknown>;

export function ErpWorkspace() {
  const [tab, setTab] = useState<ErpTab>("products");
  const [items, setItems] = useState<AnyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (activeTab: ErpTab) => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === "candidates") {
        const response = await fetch("/api/business/revenue", { cache: "no-store" });
        const data = await readApiResponse<{ candidates?: AnyRecord[] }>(response);
        setItems(data.candidates || []);
      } else {
        const response = await fetch(`/api/erp/${activeTab}`, { cache: "no-store" });
        const data = await readApiResponse<{ items: AnyRecord[] }>(response);
        setItems(data.items || []);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ERP 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function transitionCandidate(id: string, status: "confirmed" | "rejected") {
    setError(null);
    try {
      const response = await fetch("/api/business/revenue", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status })
      });
      await readApiResponse(response);
      setNotice(status === "confirmed" ? "매출이 확정되었습니다." : "후보에서 제외했습니다.");
      await load(tab);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "요청이 실패했습니다.");
    }
  }

  async function importManualCandidate(rawText: string) {
    setError(null);
    try {
      const response = await fetch("/api/business/revenue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "web",
          captureMethod: "manual",
          sourceApp: "erp-workspace",
          eventId: `manual_${Date.now()}`,
          rawText
        })
      });
      await readApiResponse(response);
      setNotice("임시 매출 후보가 추가되었습니다.");
      await load(tab);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "요청이 실패했습니다.");
    }
  }

  useEffect(() => {
    void load(tab);
  }, [load, tab]);

  async function post(entity: string, body: AnyRecord, message: string) {
    setError(null);
    try {
      const response = await fetch(`/api/erp/${entity}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      await readApiResponse(response);
      setNotice(message);
      await load(tab);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "요청이 실패했습니다.");
    }
  }

  async function patch(entity: string, body: AnyRecord, message: string) {
    setError(null);
    try {
      const response = await fetch(`/api/erp/${entity}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      await readApiResponse(response);
      setNotice(message);
      await load(tab);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "요청이 실패했습니다.");
    }
  }

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1.5" aria-label="ERP 영역">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              tab === item.id
                ? "bg-app-primary text-white"
                : "border border-app-border bg-white text-app-muted hover:text-app-primary"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-700">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="font-semibold">
            닫기
          </button>
        </div>
      ) : null}

      {tab === "products" ? (
        <ProductForm onSubmit={(body) => post("products", body, "상품이 등록되었습니다.")} />
      ) : null}
      {tab === "expenses" ? (
        <ExpenseForm onSubmit={(body) => post("expenses", body, "지출이 등록되었습니다.")} />
      ) : null}
      {tab === "vendors" ? (
        <SimpleNameForm
          label="공급업체 이름"
          onSubmit={(name) => post("vendors", { name }, "공급업체가 등록되었습니다.")}
        />
      ) : null}
      {tab === "projects" ? (
        <SimpleNameForm
          label="프로젝트 이름"
          onSubmit={(name) => post("projects", { name }, "프로젝트가 생성되었습니다.")}
        />
      ) : null}
      {tab === "orders" ? (
        <OrderForm onSubmit={(body) => post("orders", body, "주문이 생성되었습니다.")} />
      ) : null}
      {tab === "invoices" ? (
        <InvoiceForm onSubmit={(body) => post("invoices", body, "청구서가 발행되었습니다.")} />
      ) : null}
      {tab === "candidates" ? (
        <>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
            은행 알림에서 수집한 금액은 확인 전까지 임시 매출이며, 확정 전에는 어디에도 합산되지 않습니다.
          </div>
          <DeviceConnectionPanel />
          <ManualCandidateForm onSubmit={(text) => void importManualCandidate(text)} />
        </>
      ) : null}

      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl border border-app-border bg-white" aria-hidden />
      ) : tab === "candidates" ? (
        <CandidateList
          candidates={items as unknown as RevenueCandidate[]}
          onTransition={(id, status) => void transitionCandidate(id, status)}
        />
      ) : (
        <EntityTable
          tab={tab}
          items={items}
          onOrderAction={(orderId, action) =>
            void patch(
              "orders",
              { orderId, action },
              action === "fulfill" ? "주문이 이행되어 재고가 차감되었습니다." : "주문이 취소되었습니다."
            )
          }
          onRecordPayment={(invoiceId, amount) =>
            void post(
              "payments",
              { invoiceId, amount },
              "결제가 기록되고 매출에 반영되었습니다."
            )
          }
          onMoveInventory={(productId, type, quantityValue) =>
            void post(
              "inventory",
              { productId, type, quantity: quantityValue },
              type === "in" ? "입고가 반영되었습니다." : "출고가 반영되었습니다."
            )
          }
        />
      )}
    </div>
  );
}

function EntityTable({
  tab,
  items,
  onOrderAction,
  onRecordPayment,
  onMoveInventory
}: {
  tab: ErpTab;
  items: AnyRecord[];
  onOrderAction: (orderId: string, action: "fulfill" | "cancel") => void;
  onRecordPayment: (invoiceId: string, amount: number) => void;
  onMoveInventory: (productId: string, type: "in" | "out", quantity: number) => void;
}) {
  if (items.length === 0) {
    return (
      <SurfaceCard className="p-10 text-center">
        <Package size={26} className="mx-auto text-app-primary" />
        <p className="mt-3 text-sm text-app-muted">등록된 데이터가 없습니다. 위 입력으로 추가할 수 있습니다.</p>
      </SurfaceCard>
    );
  }

  if (tab === "products") {
    return (
      <Table
        headers={["상품", "SKU", "판매가", "원가", "재고", "재고 조작"]}
        rows={items.map((item) => [
          str(item.name),
          str(item.sku) || "-",
          currency(num(item.unitPrice)),
          currency(num(item.costPrice)),
          `${num(item.stockQuantity)}${str(item.unit)}`,
          <InventoryActions
            key={str(item.id)}
            onMove={(type, quantityValue) => onMoveInventory(str(item.id), type, quantityValue)}
          />
        ])}
      />
    );
  }
  if (tab === "orders") {
    return (
      <Table
        headers={["고객", "품목", "금액", "상태", "작업"]}
        rows={items.map((item) => {
          const status = str(item.status);
          const lines = Array.isArray(item.items) ? (item.items as AnyRecord[]) : [];
          return [
            str(item.customerName) || "-",
            lines.map((line) => `${str(line.productName)}×${num(line.quantity)}`).join(", "),
            currency(num(item.totalAmount)),
            orderStatusLabel(status),
            status === "confirmed" ? (
              <span key={str(item.id)} className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onOrderAction(str(item.id), "fulfill")}
                  className="rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white"
                >
                  이행(재고 차감)
                </button>
                <button
                  type="button"
                  onClick={() => onOrderAction(str(item.id), "cancel")}
                  className="rounded-lg border border-app-border bg-white px-2 py-1 text-[11px] font-semibold text-app-muted"
                >
                  취소
                </button>
              </span>
            ) : (
              "-"
            )
          ];
        })}
      />
    );
  }
  if (tab === "invoices") {
    return (
      <Table
        headers={["고객", "금액", "결제됨", "미수금", "상태", "마감", "결제 기록"]}
        rows={items.map((item) => {
          const outstanding = Math.max(0, num(item.totalAmount) - num(item.paidAmount));
          const display = str(item.displayStatus) || str(item.status);
          return [
            str(item.customerName) || "-",
            currency(num(item.totalAmount)),
            currency(num(item.paidAmount)),
            currency(outstanding),
            invoiceStatusLabel(display),
            item.dueAt ? new Date(str(item.dueAt)).toLocaleDateString("ko-KR") : "-",
            outstanding > 0 && display !== "cancelled" ? (
              <PaymentAction
                key={str(item.id)}
                max={outstanding}
                onRecord={(amount) => onRecordPayment(str(item.id), amount)}
              />
            ) : (
              "-"
            )
          ];
        })}
      />
    );
  }
  if (tab === "payments") {
    return (
      <Table
        headers={["고객", "금액", "방법", "결제일"]}
        rows={items.map((item) => [
          str(item.customerName) || "-",
          currency(num(item.amount)),
          str(item.method),
          new Date(str(item.paidAt)).toLocaleDateString("ko-KR")
        ])}
      />
    );
  }
  if (tab === "expenses") {
    return (
      <Table
        headers={["항목", "분류", "금액", "지출일"]}
        rows={items.map((item) => [
          str(item.memo) || str(item.vendorName) || "-",
          str(item.category),
          currency(num(item.amount)),
          new Date(str(item.spentAt)).toLocaleDateString("ko-KR")
        ])}
      />
    );
  }
  if (tab === "inventory") {
    return (
      <Table
        headers={["상품", "유형", "수량", "사유", "시각"]}
        rows={items.map((item) => [
          str(item.productName),
          str(item.type) === "in" ? "입고" : str(item.type) === "out" ? "출고" : "조정",
          `${num(item.quantity)}`,
          str(item.reason),
          new Date(str(item.createdAt)).toLocaleString("ko-KR")
        ])}
      />
    );
  }
  if (tab === "vendors") {
    return (
      <Table
        headers={["공급업체", "담당자", "이메일", "전화"]}
        rows={items.map((item) => [
          str(item.name),
          str(item.contactName) || "-",
          str(item.email) || "-",
          str(item.phone) || "-"
        ])}
      />
    );
  }
  return (
    <Table
      headers={["프로젝트", "고객", "상태", "예산"]}
      rows={items.map((item) => [
        str(item.name),
        str(item.customerName) || "-",
        str(item.status),
        currency(num(item.budgetAmount))
      ])}
    />
  );
}

function ProductForm({ onSubmit }: { onSubmit: (body: AnyRecord) => void }) {
  const [name, setName] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [stockQuantity, setStockQuantity] = useState("");
  const [lowStockThreshold, setLowStockThreshold] = useState("");
  return (
    <FormCard
      title="상품 등록"
      disabled={!name.trim() || !isInt(unitPrice)}
      onSubmit={() => {
        onSubmit({
          name,
          unitPrice: parseInt(unitPrice, 10),
          stockQuantity: isInt(stockQuantity) ? parseInt(stockQuantity, 10) : 0,
          lowStockThreshold: isInt(lowStockThreshold) ? parseInt(lowStockThreshold, 10) : 0
        });
        setName("");
        setUnitPrice("");
        setStockQuantity("");
        setLowStockThreshold("");
      }}
    >
      <Field label="상품명" value={name} onChange={setName} />
      <Field label="판매가(원)" value={unitPrice} onChange={setUnitPrice} numeric />
      <Field label="초기 재고" value={stockQuantity} onChange={setStockQuantity} numeric />
      <Field label="부족 기준" value={lowStockThreshold} onChange={setLowStockThreshold} numeric />
    </FormCard>
  );
}

function ExpenseForm({ onSubmit }: { onSubmit: (body: AnyRecord) => void }) {
  const [memo, setMemo] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("other");
  return (
    <FormCard
      title="지출 등록"
      disabled={!isInt(amount)}
      onSubmit={() => {
        onSubmit({ memo, amount: parseInt(amount, 10), category });
        setMemo("");
        setAmount("");
      }}
    >
      <Field label="내용" value={memo} onChange={setMemo} />
      <Field label="금액(원)" value={amount} onChange={setAmount} numeric />
      <label className="flex flex-col gap-1 text-xs text-app-muted">
        분류
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="rounded-xl border border-app-border bg-white px-2.5 py-2 text-sm text-app-text outline-none focus:border-app-primary"
        >
          <option value="purchase">구매</option>
          <option value="salary">급여</option>
          <option value="rent">임대료</option>
          <option value="marketing">마케팅</option>
          <option value="software">소프트웨어</option>
          <option value="tax">세금</option>
          <option value="travel">출장</option>
          <option value="other">기타</option>
        </select>
      </label>
    </FormCard>
  );
}

function OrderForm({ onSubmit }: { onSubmit: (body: AnyRecord) => void }) {
  const [customerName, setCustomerName] = useState("");
  const [productName, setProductName] = useState("");
  const [quantityValue, setQuantityValue] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  return (
    <FormCard
      title="주문 생성"
      disabled={!productName.trim() || !isInt(unitPrice) || !isInt(quantityValue)}
      onSubmit={() => {
        onSubmit({
          customerName,
          items: [
            {
              productName,
              quantity: parseInt(quantityValue, 10),
              unitPrice: parseInt(unitPrice, 10)
            }
          ]
        });
        setCustomerName("");
        setProductName("");
        setQuantityValue("1");
        setUnitPrice("");
      }}
    >
      <Field label="고객명" value={customerName} onChange={setCustomerName} />
      <Field label="품목명" value={productName} onChange={setProductName} />
      <Field label="수량" value={quantityValue} onChange={setQuantityValue} numeric />
      <Field label="단가(원)" value={unitPrice} onChange={setUnitPrice} numeric />
    </FormCard>
  );
}

function InvoiceForm({ onSubmit }: { onSubmit: (body: AnyRecord) => void }) {
  const [customerName, setCustomerName] = useState("");
  const [itemName, setItemName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueAt, setDueAt] = useState("");
  return (
    <FormCard
      title="청구서 발행"
      disabled={!itemName.trim() || !isInt(amount)}
      onSubmit={() => {
        onSubmit({
          customerName,
          items: [{ productName: itemName, quantity: 1, unitPrice: parseInt(amount, 10) }],
          dueAt: dueAt || undefined
        });
        setCustomerName("");
        setItemName("");
        setAmount("");
        setDueAt("");
      }}
    >
      <Field label="고객명" value={customerName} onChange={setCustomerName} />
      <Field label="항목" value={itemName} onChange={setItemName} />
      <Field label="금액(원)" value={amount} onChange={setAmount} numeric />
      <label className="flex flex-col gap-1 text-xs text-app-muted">
        결제 기한
        <input
          type="date"
          value={dueAt}
          onChange={(event) => setDueAt(event.target.value)}
          className="rounded-xl border border-app-border bg-white px-2.5 py-2 text-sm text-app-text outline-none focus:border-app-primary"
        />
      </label>
    </FormCard>
  );
}

function SimpleNameForm({
  label,
  onSubmit
}: {
  label: string;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <FormCard
      title={label}
      disabled={!name.trim()}
      onSubmit={() => {
        onSubmit(name);
        setName("");
      }}
    >
      <Field label={label} value={name} onChange={setName} />
    </FormCard>
  );
}

function FormCard({
  title,
  disabled,
  onSubmit,
  children
}: {
  title: string;
  disabled: boolean;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  return (
    <SurfaceCard className="p-4">
      <p className="text-xs font-semibold text-app-text">{title}</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        {children}
        <button
          type="button"
          disabled={disabled}
          onClick={onSubmit}
          className="inline-flex items-center gap-1 rounded-xl bg-app-primary px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Plus size={13} />
          추가
        </button>
      </div>
    </SurfaceCard>
  );
}

function Field({
  label,
  value,
  onChange,
  numeric = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-app-muted">
      {label}
      <input
        value={value}
        inputMode={numeric ? "numeric" : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="w-36 rounded-xl border border-app-border bg-white px-2.5 py-2 text-sm text-app-text outline-none focus:border-app-primary"
      />
    </label>
  );
}

function InventoryActions({
  onMove
}: {
  onMove: (type: "in" | "out", quantity: number) => void;
}) {
  const [value, setValue] = useState("1");
  return (
    <span className="flex items-center gap-1.5">
      <input
        value={value}
        inputMode="numeric"
        aria-label="재고 수량"
        onChange={(event) => setValue(event.target.value)}
        className="w-14 rounded-lg border border-app-border bg-white px-2 py-1 text-xs text-app-text outline-none focus:border-app-primary"
      />
      <button
        type="button"
        disabled={!isInt(value)}
        onClick={() => onMove("in", parseInt(value, 10))}
        className="rounded-lg bg-app-primary px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
      >
        입고
      </button>
      <button
        type="button"
        disabled={!isInt(value)}
        onClick={() => onMove("out", parseInt(value, 10))}
        className="rounded-lg border border-app-border bg-white px-2 py-1 text-[11px] font-semibold text-app-muted disabled:opacity-40"
      >
        출고
      </button>
    </span>
  );
}

function PaymentAction({
  max,
  onRecord
}: {
  max: number;
  onRecord: (amount: number) => void;
}) {
  const [value, setValue] = useState(String(max));
  return (
    <span className="flex items-center gap-1.5">
      <input
        value={value}
        inputMode="numeric"
        aria-label="결제 금액"
        onChange={(event) => setValue(event.target.value)}
        className="w-24 rounded-lg border border-app-border bg-white px-2 py-1 text-xs text-app-text outline-none focus:border-app-primary"
      />
      <button
        type="button"
        disabled={!isInt(value) || parseInt(value, 10) <= 0 || parseInt(value, 10) > max}
        onClick={() => onRecord(parseInt(value, 10))}
        className="rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
      >
        결제 기록
      </button>
    </span>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <SurfaceCard className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-app-bg text-xs text-app-muted">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3 font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-t border-app-border">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-3 text-app-text">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SurfaceCard>
  );
}

function CandidateList({
  candidates,
  onTransition
}: {
  candidates: RevenueCandidate[];
  onTransition: (id: string, status: "confirmed" | "rejected") => void;
}) {
  if (candidates.length === 0) {
    return (
      <SurfaceCard className="p-10 text-center">
        <Package size={26} className="mx-auto text-app-primary" />
        <p className="mt-3 text-sm text-app-muted">수집된 매출 후보가 없습니다.</p>
      </SurfaceCard>
    );
  }
  return (
    <SurfaceCard className="p-5">
      <div className="space-y-3">
        {candidates.map((candidate) => (
          <div
            key={candidate.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-app-border bg-app-bg p-4"
          >
            <div>
              <p className="text-sm font-semibold text-app-text">
                {candidate.amount === null ? "금액 확인 필요" : currency(candidate.amount)}
              </p>
              <p className="mt-1 text-xs text-app-muted">
                {candidate.platform} · {candidate.captureMethod} · 신뢰도 {Math.round(candidate.confidence * 100)}%
              </p>
            </div>
            {candidate.status === "provisional" ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onTransition(candidate.id, "confirmed")}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
                >
                  매출 확정
                </button>
                <button
                  type="button"
                  onClick={() => onTransition(candidate.id, "rejected")}
                  className="rounded-xl border border-app-border bg-white px-3 py-2 text-xs font-semibold text-app-muted"
                >
                  개인/오류 제외
                </button>
              </div>
            ) : (
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-app-muted">
                {candidate.status === "confirmed" ? "확정됨" : "제외됨"}
              </span>
            )}
          </div>
        ))}
      </div>
    </SurfaceCard>
  );
}

function ManualCandidateForm({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <SurfaceCard className="p-5">
      <label className="text-sm font-semibold text-app-text" htmlFor="manual-revenue-text">
        알림 문구 직접 가져오기
      </label>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <textarea
          id="manual-revenue-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="예: 입금 50,000원 홍길동"
          className="min-h-20 flex-1 rounded-2xl border border-app-border bg-white px-3 py-2 text-sm outline-none focus:border-app-primary"
        />
        <button
          type="button"
          disabled={!text.trim()}
          onClick={() => {
            onSubmit(text);
            setText("");
          }}
          className="rounded-2xl bg-app-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          임시 매출 추가
        </button>
      </div>
    </SurfaceCard>
  );
}

function orderStatusLabel(status: string) {
  if (status === "confirmed") return "확정";
  if (status === "fulfilled") return "이행 완료";
  if (status === "cancelled") return "취소";
  return status;
}

function invoiceStatusLabel(status: string) {
  if (status === "sent") return "발행됨";
  if (status === "partially_paid") return "부분 결제";
  if (status === "paid") return "결제 완료";
  if (status === "overdue") return "연체";
  if (status === "cancelled") return "취소";
  return status;
}

function str(value: unknown) {
  return typeof value === "string" ? value : "";
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isInt(value: string) {
  return /^\d+$/u.test(value.trim());
}

function currency(value: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0
  }).format(value);
}
