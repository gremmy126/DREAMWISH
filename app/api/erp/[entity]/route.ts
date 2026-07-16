import { NextResponse } from "next/server";
import { OwnerContextError, requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  cancelErpOrder,
  createErpExpense,
  createErpInvoice,
  createErpOrder,
  createErpProduct,
  createErpProject,
  createErpVendor,
  ErpNotFoundError,
  ErpValidationError,
  fulfillErpOrder,
  listErpExpenses,
  listErpInventoryMovements,
  listErpInvoices,
  listErpOrders,
  listErpPayments,
  listErpProducts,
  listErpProjects,
  listErpVendors,
  moveErpInventory,
  recordErpPayment,
  softDeleteErpEntity,
  updateErpEntity
} from "@/src/lib/erp/erp.repository";
import { resolveInvoiceDisplayStatus } from "@/src/lib/erp/erp.types";

type RouteContext = { params: Promise<{ entity: string }> };

const ENTITIES = new Set([
  "vendors",
  "products",
  "orders",
  "invoices",
  "payments",
  "expenses",
  "inventory",
  "projects"
]);

export async function GET(request: Request, context: RouteContext) {
  return handle(request, context, async (owner, entity, _body, url) => {
    switch (entity) {
      case "vendors":
        return { items: await listErpVendors(owner) };
      case "products":
        return { items: await listErpProducts(owner) };
      case "orders":
        return { items: await listErpOrders(owner) };
      case "invoices": {
        const now = new Date();
        const items = (await listErpInvoices(owner)).map((invoice) => ({
          ...invoice,
          displayStatus: resolveInvoiceDisplayStatus(invoice, now)
        }));
        return { items };
      }
      case "payments":
        return { items: await listErpPayments(owner) };
      case "expenses":
        return { items: await listErpExpenses(owner) };
      case "inventory":
        return {
          items: await listErpInventoryMovements(
            owner,
            url.searchParams.get("productId") || undefined
          )
        };
      case "projects":
        return { items: await listErpProjects(owner) };
      default:
        throw new ErpNotFoundError("Entity");
    }
  });
}

export async function POST(request: Request, context: RouteContext) {
  return handle(request, context, async (owner, entity, body) => {
    switch (entity) {
      case "vendors":
        return {
          vendor: await createErpVendor({
            ownerId: owner,
            name: text(body.name, 120),
            contactName: text(body.contactName, 120),
            email: text(body.email, 254),
            phone: text(body.phone, 40),
            memo: text(body.memo, 4000),
            tags: stringArray(body.tags)
          })
        };
      case "products":
        return {
          product: await createErpProduct({
            ownerId: owner,
            name: text(body.name, 200),
            sku: text(body.sku, 80),
            category: text(body.category, 120),
            unit: text(body.unit, 20),
            unitPrice: money(body.unitPrice),
            costPrice: optionalMoney(body.costPrice),
            stockQuantity: optionalQuantity(body.stockQuantity),
            lowStockThreshold: optionalQuantity(body.lowStockThreshold),
            memo: text(body.memo, 4000)
          })
        };
      case "orders":
        return {
          order: await createErpOrder({
            ownerId: owner,
            customerId: id(body.customerId),
            customerName: text(body.customerName, 200),
            projectId: id(body.projectId),
            items: orderItems(body.items),
            orderedAt: isoDate(body.orderedAt),
            memo: text(body.memo, 4000)
          })
        };
      case "invoices":
        return {
          invoice: await createErpInvoice({
            ownerId: owner,
            orderId: id(body.orderId),
            customerId: id(body.customerId),
            customerName: text(body.customerName, 200),
            projectId: id(body.projectId),
            items: body.items === undefined ? undefined : orderItems(body.items),
            issuedAt: isoDate(body.issuedAt),
            dueAt: isoDate(body.dueAt) || null,
            memo: text(body.memo, 4000)
          })
        };
      case "payments":
        return await recordErpPayment({
          ownerId: owner,
          invoiceId: requireId(body.invoiceId, "invoiceId"),
          amount: money(body.amount),
          method: paymentMethod(body.method),
          paidAt: isoDate(body.paidAt),
          memo: text(body.memo, 4000)
        });
      case "expenses":
        return {
          expense: await createErpExpense({
            ownerId: owner,
            vendorId: id(body.vendorId),
            vendorName: text(body.vendorName, 200),
            projectId: id(body.projectId),
            category: expenseCategory(body.category),
            amount: money(body.amount),
            spentAt: isoDate(body.spentAt),
            memo: text(body.memo, 4000)
          })
        };
      case "inventory":
        return await moveErpInventory({
          ownerId: owner,
          productId: requireId(body.productId, "productId"),
          type: movementType(body.type),
          quantity: quantity(body.quantity),
          reason: text(body.reason, 200),
          referenceId: id(body.referenceId)
        });
      case "projects":
        return {
          project: await createErpProject({
            ownerId: owner,
            name: text(body.name, 200),
            customerId: id(body.customerId),
            customerName: text(body.customerName, 200),
            budgetAmount: optionalMoney(body.budgetAmount),
            startedAt: isoDate(body.startedAt),
            memo: text(body.memo, 4000)
          })
        };
      default:
        throw new ErpNotFoundError("Entity");
    }
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  return handle(request, context, async (owner, entity, body) => {
    if (entity === "orders") {
      const orderId = requireId(body.orderId, "orderId");
      const action = typeof body.action === "string" ? body.action : "";
      if (action === "fulfill") return { order: await fulfillErpOrder(owner, orderId) };
      if (action === "cancel") return { order: await cancelErpOrder(owner, orderId) };
      throw new ErpValidationError("Unknown order action.");
    }
    if (
      entity === "vendors" ||
      entity === "products" ||
      entity === "expenses" ||
      entity === "projects"
    ) {
      const entityId = requireId(body.id, "id");
      const patch: Record<string, unknown> = {};
      const allowed: Record<string, string[]> = {
        vendors: ["name", "contactName", "email", "phone", "memo"],
        products: [
          "name",
          "sku",
          "category",
          "unit",
          "unitPrice",
          "costPrice",
          "lowStockThreshold",
          "memo"
        ],
        expenses: ["vendorName", "category", "amount", "spentAt", "memo", "projectId"],
        projects: ["name", "customerName", "status", "budgetAmount", "startedAt", "endedAt", "memo"]
      };
      for (const field of allowed[entity]) {
        if (body[field] !== undefined) patch[field] = body[field];
      }
      return { item: await updateErpEntity(owner, entity, entityId, patch) };
    }
    throw new ErpValidationError("This entity does not support PATCH.");
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  return handle(request, context, async (owner, entity, _body, url) => {
    const entityId = url.searchParams.get("id") || "";
    if (!entityId) throw new ErpNotFoundError("Entity");
    if (
      entity !== "vendors" &&
      entity !== "products" &&
      entity !== "orders" &&
      entity !== "invoices" &&
      entity !== "expenses" &&
      entity !== "projects"
    ) {
      throw new ErpValidationError("This entity does not support DELETE.");
    }
    const deleted = await softDeleteErpEntity(owner, entity, entityId);
    if (!deleted) throw new ErpNotFoundError("Entity");
    return { deleted: true };
  });
}

async function handle(
  request: Request,
  context: RouteContext,
  operation: (
    ownerId: string,
    entity: string,
    body: Record<string, unknown>,
    url: URL
  ) => Promise<unknown>
) {
  try {
    const owner = await requireOwnerContext(request);
    const { entity } = await context.params;
    if (!ENTITIES.has(entity)) {
      return NextResponse.json(
        { ok: false, error: { code: "ERP_NOT_FOUND", message: "Unknown ERP entity." } },
        { status: 404 }
      );
    }
    const body =
      request.method === "GET" || request.method === "DELETE"
        ? {}
        : ((await request.json().catch(() => ({}))) as Record<string, unknown>);
    const data = await operation(owner.uid, entity, body, new URL(request.url));
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof OwnerContextError) {
      return NextResponse.json(
        { ok: false, error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    if (error instanceof ErpValidationError || error instanceof ErpNotFoundError) {
      return NextResponse.json(
        { ok: false, error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    if (error instanceof Error && /must be|required|positive/u.test(error.message)) {
      return NextResponse.json(
        { ok: false, error: { code: "ERP_VALIDATION", message: error.message } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_SERVER_ERROR", message: "ERP request failed." } },
      { status: 500 }
    );
  }
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function id(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 100) : null;
}

function requireId(value: unknown, field: string): string {
  const parsed = id(value);
  if (!parsed) throw new ErpValidationError(`${field} is required.`);
  return parsed;
}

function money(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ErpValidationError("Amount must be a non-negative integer in KRW.");
  }
  return value;
}

function optionalMoney(value: unknown): number | undefined {
  return value === undefined || value === null ? undefined : money(value);
}

function quantity(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ErpValidationError("Quantity must be a non-negative integer.");
  }
  return value;
}

function optionalQuantity(value: unknown): number | undefined {
  return value === undefined || value === null ? undefined : quantity(value);
}

function isoDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ErpValidationError("Invalid date value.");
  return parsed.toISOString();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 20)
    : [];
}

function orderItems(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new ErpValidationError("items must be a non-empty array.");
  }
  return value.map((item) => {
    const record = (item || {}) as Record<string, unknown>;
    return {
      productId: id(record.productId),
      productName: text(record.productName, 200),
      quantity: quantity(record.quantity),
      unitPrice: money(record.unitPrice)
    };
  });
}

function paymentMethod(value: unknown) {
  return value === "transfer" || value === "card" || value === "cash" || value === "other"
    ? value
    : undefined;
}

function expenseCategory(value: unknown) {
  const categories = [
    "purchase",
    "salary",
    "rent",
    "marketing",
    "software",
    "tax",
    "travel",
    "other"
  ] as const;
  return categories.includes(value as (typeof categories)[number])
    ? (value as (typeof categories)[number])
    : undefined;
}

function movementType(value: unknown) {
  if (value === "in" || value === "out" || value === "adjust") return value;
  throw new ErpValidationError("Inventory movement type must be in, out, or adjust.");
}
