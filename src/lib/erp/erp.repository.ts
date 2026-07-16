import { randomUUID } from "node:crypto";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";
import {
  assertMoneyAmount,
  assertQuantity,
  type ErpAuditEvent,
  type ErpExpense,
  type ErpInventoryMovement,
  type ErpInvoice,
  type ErpOrder,
  type ErpOrderItem,
  type ErpPayment,
  type ErpProduct,
  type ErpProject,
  type ErpVendor
} from "./erp.types";

type ErpDb = {
  vendors: ErpVendor[];
  products: ErpProduct[];
  orders: ErpOrder[];
  invoices: ErpInvoice[];
  payments: ErpPayment[];
  expenses: ErpExpense[];
  inventoryMovements: ErpInventoryMovement[];
  projects: ErpProject[];
  audit: ErpAuditEvent[];
};

const FILE_NAME = "erp.json";
const EMPTY_DB: ErpDb = {
  vendors: [],
  products: [],
  orders: [],
  invoices: [],
  payments: [],
  expenses: [],
  inventoryMovements: [],
  projects: [],
  audit: []
};

export class ErpValidationError extends Error {
  readonly code = "ERP_VALIDATION" as const;
  readonly status = 400 as const;
}

export class ErpNotFoundError extends Error {
  readonly code = "ERP_NOT_FOUND" as const;
  readonly status = 404 as const;

  constructor(entity: string) {
    super(`${entity} not found`);
    this.name = "ErpNotFoundError";
  }
}

export async function getErpSnapshot(ownerId: string) {
  return accessDb(ownerId, (db) => ({
    vendors: ownedActive(db.vendors, ownerId),
    products: ownedActive(db.products, ownerId),
    orders: ownedActive(db.orders, ownerId),
    invoices: ownedActive(db.invoices, ownerId),
    payments: db.payments.filter((item) => item.ownerId === ownerId),
    expenses: ownedActive(db.expenses, ownerId),
    inventoryMovements: db.inventoryMovements.filter((item) => item.ownerId === ownerId),
    projects: ownedActive(db.projects, ownerId)
  }));
}

export async function listErpVendors(ownerId: string) {
  return accessDb(ownerId, (db) => ownedActive(db.vendors, ownerId));
}

export async function listErpProducts(ownerId: string) {
  return accessDb(ownerId, (db) => ownedActive(db.products, ownerId));
}

export async function listErpOrders(ownerId: string) {
  return accessDb(ownerId, (db) => ownedActive(db.orders, ownerId));
}

export async function listErpInvoices(ownerId: string) {
  return accessDb(ownerId, (db) => ownedActive(db.invoices, ownerId));
}

export async function listErpPayments(ownerId: string) {
  return accessDb(ownerId, (db) => db.payments.filter((item) => item.ownerId === ownerId));
}

export async function listErpExpenses(ownerId: string) {
  return accessDb(ownerId, (db) => ownedActive(db.expenses, ownerId));
}

export async function listErpInventoryMovements(ownerId: string, productId?: string) {
  return accessDb(ownerId, (db) =>
    db.inventoryMovements.filter(
      (item) => item.ownerId === ownerId && (!productId || item.productId === productId)
    )
  );
}

export async function listErpProjects(ownerId: string) {
  return accessDb(ownerId, (db) => ownedActive(db.projects, ownerId));
}

export async function createErpVendor(input: {
  ownerId: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  memo?: string;
  tags?: string[];
}) {
  requireText(input.name, "name");
  return accessDb(input.ownerId, (db) => {
    const now = nowIso();
    const vendor: ErpVendor = {
      ownerId: input.ownerId,
      id: randomUUID(),
      name: input.name.trim(),
      contactName: input.contactName?.trim() || "",
      email: input.email?.trim() || "",
      phone: input.phone?.trim() || "",
      memo: input.memo?.trim() || "",
      tags: (input.tags || []).map((tag) => tag.trim()).filter(Boolean),
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    db.vendors.unshift(vendor);
    audit(db, input.ownerId, "vendor.created", vendor.id, now);
    return vendor;
  });
}

export async function createErpProduct(input: {
  ownerId: string;
  name: string;
  sku?: string;
  category?: string;
  unit?: string;
  unitPrice: number;
  costPrice?: number;
  stockQuantity?: number;
  lowStockThreshold?: number;
  memo?: string;
}) {
  requireText(input.name, "name");
  assertMoneyAmount(input.unitPrice, "unitPrice");
  assertMoneyAmount(input.costPrice ?? 0, "costPrice");
  assertQuantity(input.stockQuantity ?? 0, "stockQuantity");
  assertQuantity(input.lowStockThreshold ?? 0, "lowStockThreshold");
  return accessDb(input.ownerId, (db) => {
    const now = nowIso();
    const product: ErpProduct = {
      ownerId: input.ownerId,
      id: randomUUID(),
      name: input.name.trim(),
      sku: input.sku?.trim() || "",
      category: input.category?.trim() || "",
      unit: input.unit?.trim() || "개",
      unitPrice: input.unitPrice,
      costPrice: input.costPrice ?? 0,
      stockQuantity: input.stockQuantity ?? 0,
      lowStockThreshold: input.lowStockThreshold ?? 0,
      memo: input.memo?.trim() || "",
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    db.products.unshift(product);
    if (product.stockQuantity > 0) {
      db.inventoryMovements.unshift({
        ownerId: input.ownerId,
        id: randomUUID(),
        productId: product.id,
        productName: product.name,
        type: "in",
        quantity: product.stockQuantity,
        reason: "initial_stock",
        referenceId: null,
        createdAt: now
      });
    }
    audit(db, input.ownerId, "product.created", product.id, now);
    return product;
  });
}

export async function createErpOrder(input: {
  ownerId: string;
  customerId?: string | null;
  customerName?: string;
  projectId?: string | null;
  items: Array<{
    productId?: string | null;
    productName?: string;
    quantity: number;
    unitPrice: number;
  }>;
  orderedAt?: string;
  memo?: string;
}) {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new ErpValidationError("Order needs at least one item.");
  }
  return accessDb(input.ownerId, (db) => {
    const now = nowIso();
    const items = input.items.map((item) =>
      buildOrderItem(db, input.ownerId, item)
    );
    const order: ErpOrder = {
      ownerId: input.ownerId,
      id: randomUUID(),
      customerId: input.customerId || null,
      customerName: input.customerName?.trim() || "",
      projectId: input.projectId || null,
      status: "confirmed",
      items,
      totalAmount: items.reduce((total, item) => total + item.amount, 0),
      orderedAt: input.orderedAt || now,
      fulfilledAt: null,
      memo: input.memo?.trim() || "",
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    db.orders.unshift(order);
    audit(db, input.ownerId, "order.created", order.id, now);
    return order;
  });
}

/** Fulfilling an order deducts stock for each product-linked line item. */
export async function fulfillErpOrder(ownerId: string, orderId: string) {
  return accessDb(ownerId, (db) => {
    const order = db.orders.find(
      (item) => item.ownerId === ownerId && item.id === orderId && !item.deletedAt
    );
    if (!order) throw new ErpNotFoundError("Order");
    if (order.status === "fulfilled") return order;
    if (order.status === "cancelled") {
      throw new ErpValidationError("Cancelled orders cannot be fulfilled.");
    }
    const now = nowIso();
    for (const item of order.items) {
      if (!item.productId) continue;
      const product = db.products.find(
        (candidate) =>
          candidate.ownerId === ownerId && candidate.id === item.productId && !candidate.deletedAt
      );
      if (!product) continue;
      product.stockQuantity = Math.max(0, product.stockQuantity - item.quantity);
      product.updatedAt = now;
      db.inventoryMovements.unshift({
        ownerId,
        id: randomUUID(),
        productId: product.id,
        productName: product.name,
        type: "out",
        quantity: item.quantity,
        reason: "order_fulfilled",
        referenceId: order.id,
        createdAt: now
      });
    }
    order.status = "fulfilled";
    order.fulfilledAt = now;
    order.updatedAt = now;
    audit(db, ownerId, "order.fulfilled", order.id, now);
    return order;
  });
}

export async function cancelErpOrder(ownerId: string, orderId: string) {
  return accessDb(ownerId, (db) => {
    const order = db.orders.find(
      (item) => item.ownerId === ownerId && item.id === orderId && !item.deletedAt
    );
    if (!order) throw new ErpNotFoundError("Order");
    if (order.status === "fulfilled") {
      throw new ErpValidationError("Fulfilled orders cannot be cancelled.");
    }
    const now = nowIso();
    order.status = "cancelled";
    order.updatedAt = now;
    audit(db, ownerId, "order.cancelled", order.id, now);
    return order;
  });
}

export async function createErpInvoice(input: {
  ownerId: string;
  orderId?: string | null;
  customerId?: string | null;
  customerName?: string;
  projectId?: string | null;
  items?: Array<{
    productId?: string | null;
    productName?: string;
    quantity: number;
    unitPrice: number;
  }>;
  issuedAt?: string;
  dueAt?: string | null;
  memo?: string;
}) {
  return accessDb(input.ownerId, (db) => {
    const now = nowIso();
    let items: ErpOrderItem[] = [];
    let customerId = input.customerId || null;
    let customerName = input.customerName?.trim() || "";
    let projectId = input.projectId || null;

    if (input.orderId) {
      const order = db.orders.find(
        (item) => item.ownerId === input.ownerId && item.id === input.orderId && !item.deletedAt
      );
      if (!order) throw new ErpNotFoundError("Order");
      items = order.items.map((item) => ({ ...item }));
      customerId = customerId || order.customerId;
      customerName = customerName || order.customerName;
      projectId = projectId || order.projectId;
    } else {
      if (!Array.isArray(input.items) || input.items.length === 0) {
        throw new ErpValidationError("Invoice needs an order or at least one item.");
      }
      items = input.items.map((item) => buildOrderItem(db, input.ownerId, item));
    }

    const invoice: ErpInvoice = {
      ownerId: input.ownerId,
      id: randomUUID(),
      orderId: input.orderId || null,
      customerId,
      customerName,
      projectId,
      status: "sent",
      items,
      totalAmount: items.reduce((total, item) => total + item.amount, 0),
      paidAmount: 0,
      issuedAt: input.issuedAt || now,
      dueAt: input.dueAt || null,
      paidAt: null,
      memo: input.memo?.trim() || "",
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    db.invoices.unshift(invoice);
    audit(db, input.ownerId, "invoice.created", invoice.id, now);
    return invoice;
  });
}

/**
 * Recording a payment is the single source of ERP revenue: the invoice's
 * paidAmount advances and the payment row itself is the revenue ledger entry.
 */
export async function recordErpPayment(input: {
  ownerId: string;
  invoiceId: string;
  amount: number;
  method?: ErpPayment["method"];
  paidAt?: string;
  memo?: string;
}) {
  assertMoneyAmount(input.amount, "amount");
  if (input.amount === 0) throw new ErpValidationError("Payment amount must be positive.");
  return accessDb(input.ownerId, (db) => {
    const invoice = db.invoices.find(
      (item) => item.ownerId === input.ownerId && item.id === input.invoiceId && !item.deletedAt
    );
    if (!invoice) throw new ErpNotFoundError("Invoice");
    if (invoice.status === "cancelled") {
      throw new ErpValidationError("Cancelled invoices cannot accept payments.");
    }
    const outstanding = Math.max(0, invoice.totalAmount - invoice.paidAmount);
    if (input.amount > outstanding) {
      throw new ErpValidationError("Payment exceeds the outstanding invoice amount.");
    }
    const now = nowIso();
    const payment: ErpPayment = {
      ownerId: input.ownerId,
      id: randomUUID(),
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      projectId: invoice.projectId,
      amount: input.amount,
      method: input.method || "transfer",
      paidAt: input.paidAt || now,
      memo: input.memo?.trim() || "",
      createdAt: now
    };
    db.payments.unshift(payment);
    invoice.paidAmount += input.amount;
    invoice.status = invoice.paidAmount >= invoice.totalAmount ? "paid" : "partially_paid";
    invoice.paidAt = invoice.status === "paid" ? payment.paidAt : invoice.paidAt;
    invoice.updatedAt = now;
    audit(db, input.ownerId, "payment.recorded", payment.id, now);
    return { payment, invoice };
  });
}

export async function createErpExpense(input: {
  ownerId: string;
  vendorId?: string | null;
  vendorName?: string;
  projectId?: string | null;
  category?: ErpExpense["category"];
  amount: number;
  spentAt?: string;
  memo?: string;
}) {
  assertMoneyAmount(input.amount, "amount");
  return accessDb(input.ownerId, (db) => {
    const now = nowIso();
    const expense: ErpExpense = {
      ownerId: input.ownerId,
      id: randomUUID(),
      vendorId: input.vendorId || null,
      vendorName: input.vendorName?.trim() || "",
      projectId: input.projectId || null,
      category: input.category || "other",
      amount: input.amount,
      spentAt: input.spentAt || now,
      memo: input.memo?.trim() || "",
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    db.expenses.unshift(expense);
    audit(db, input.ownerId, "expense.created", expense.id, now);
    return expense;
  });
}

/** Purchase receipts and manual corrections move stock with a movement record. */
export async function moveErpInventory(input: {
  ownerId: string;
  productId: string;
  type: ErpInventoryMovement["type"];
  quantity: number;
  reason?: string;
  referenceId?: string | null;
}) {
  assertQuantity(input.quantity, "quantity");
  if (input.quantity === 0 && input.type !== "adjust") {
    throw new ErpValidationError("Inventory movement quantity must be positive.");
  }
  return accessDb(input.ownerId, (db) => {
    const product = db.products.find(
      (item) => item.ownerId === input.ownerId && item.id === input.productId && !item.deletedAt
    );
    if (!product) throw new ErpNotFoundError("Product");
    const now = nowIso();
    if (input.type === "in") {
      product.stockQuantity += input.quantity;
    } else if (input.type === "out") {
      if (input.quantity > product.stockQuantity) {
        throw new ErpValidationError("Cannot remove more stock than available.");
      }
      product.stockQuantity -= input.quantity;
    } else {
      product.stockQuantity = input.quantity;
    }
    product.updatedAt = now;
    const movement: ErpInventoryMovement = {
      ownerId: input.ownerId,
      id: randomUUID(),
      productId: product.id,
      productName: product.name,
      type: input.type,
      quantity: input.quantity,
      reason: input.reason?.trim() || (input.type === "in" ? "purchase_received" : "manual"),
      referenceId: input.referenceId || null,
      createdAt: now
    };
    db.inventoryMovements.unshift(movement);
    audit(db, input.ownerId, "inventory.moved", movement.id, now);
    return { movement, product };
  });
}

export async function createErpProject(input: {
  ownerId: string;
  name: string;
  customerId?: string | null;
  customerName?: string;
  budgetAmount?: number;
  startedAt?: string | null;
  memo?: string;
}) {
  requireText(input.name, "name");
  assertMoneyAmount(input.budgetAmount ?? 0, "budgetAmount");
  return accessDb(input.ownerId, (db) => {
    const now = nowIso();
    const project: ErpProject = {
      ownerId: input.ownerId,
      id: randomUUID(),
      name: input.name.trim(),
      customerId: input.customerId || null,
      customerName: input.customerName?.trim() || "",
      status: "active",
      budgetAmount: input.budgetAmount ?? 0,
      startedAt: input.startedAt || now,
      endedAt: null,
      memo: input.memo?.trim() || "",
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    db.projects.unshift(project);
    audit(db, input.ownerId, "project.created", project.id, now);
    return project;
  });
}

export async function updateErpEntity<
  K extends "vendors" | "products" | "expenses" | "projects"
>(ownerId: string, collection: K, entityId: string, patch: Record<string, unknown>) {
  return accessDb(ownerId, (db) => {
    const items = db[collection] as Array<{
      ownerId: string;
      id: string;
      createdAt: string;
      updatedAt: string;
      deletedAt: string | null;
    }>;
    const index = items.findIndex(
      (item) => item.ownerId === ownerId && item.id === entityId && !item.deletedAt
    );
    if (index < 0) throw new ErpNotFoundError(collection);
    const current = items[index];
    for (const field of ["unitPrice", "costPrice", "budgetAmount", "amount"]) {
      if (typeof patch[field] === "number") assertMoneyAmount(patch[field] as number, field);
    }
    for (const field of ["stockQuantity", "lowStockThreshold"]) {
      if (typeof patch[field] === "number") assertQuantity(patch[field] as number, field);
    }
    const updated = {
      ...current,
      ...patch,
      ownerId,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: nowIso()
    };
    items[index] = updated;
    audit(db, ownerId, `${collection}.updated`, entityId, updated.updatedAt);
    return updated;
  });
}

export async function softDeleteErpEntity(
  ownerId: string,
  collection: "vendors" | "products" | "orders" | "invoices" | "expenses" | "projects",
  entityId: string
) {
  return accessDb(ownerId, (db) => {
    const items = db[collection] as Array<{
      ownerId: string;
      id: string;
      updatedAt: string;
      deletedAt: string | null;
    }>;
    const entity = items.find(
      (item) => item.ownerId === ownerId && item.id === entityId && !item.deletedAt
    );
    if (!entity) return false;
    const now = nowIso();
    entity.deletedAt = now;
    entity.updatedAt = now;
    audit(db, ownerId, `${collection}.deleted`, entityId, now);
    return true;
  });
}

export async function listErpAuditEvents(ownerId: string) {
  return accessDb(ownerId, (db) => db.audit.filter((item) => item.ownerId === ownerId));
}

function buildOrderItem(
  db: ErpDb,
  ownerId: string,
  item: {
    productId?: string | null;
    productName?: string;
    quantity: number;
    unitPrice: number;
  }
): ErpOrderItem {
  assertQuantity(item.quantity, "quantity");
  assertMoneyAmount(item.unitPrice, "unitPrice");
  if (item.quantity === 0) throw new ErpValidationError("Item quantity must be positive.");
  const product = item.productId
    ? db.products.find(
        (candidate) =>
          candidate.ownerId === ownerId && candidate.id === item.productId && !candidate.deletedAt
      )
    : undefined;
  if (item.productId && !product) throw new ErpNotFoundError("Product");
  return {
    productId: product?.id || null,
    productName: product?.name || item.productName?.trim() || "품목",
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    amount: item.quantity * item.unitPrice
  };
}

function ownedActive<T extends { ownerId: string; deletedAt: string | null }>(
  items: T[],
  ownerId: string
) {
  return items.filter((item) => item.ownerId === ownerId && !item.deletedAt);
}

function requireText(value: string, field: string) {
  if (!value?.trim()) throw new ErpValidationError(`${field} is required.`);
}

function audit(db: ErpDb, ownerId: string, action: string, entityId: string, createdAt: string) {
  db.audit.unshift({ ownerId, id: randomUUID(), action, entityId, createdAt });
}

function nowIso() {
  return new Date().toISOString();
}

async function accessDb<T>(ownerId: string, operation: (db: ErpDb) => T | Promise<T>): Promise<T> {
  if (!ownerId?.trim()) throw new ErpValidationError("ownerId is required.");
  return withJsonStoreLock(FILE_NAME, async () => {
    const raw = await readJsonStore<ErpDb>(FILE_NAME, EMPTY_DB);
    const db = normalizeDb(raw);
    const result = await operation(db);
    await writeJsonStore(FILE_NAME, db);
    return result;
  });
}

function normalizeDb(raw: Partial<ErpDb>): ErpDb {
  return {
    vendors: Array.isArray(raw.vendors) ? raw.vendors : [],
    products: Array.isArray(raw.products) ? raw.products : [],
    orders: Array.isArray(raw.orders) ? raw.orders : [],
    invoices: Array.isArray(raw.invoices) ? raw.invoices : [],
    payments: Array.isArray(raw.payments) ? raw.payments : [],
    expenses: Array.isArray(raw.expenses) ? raw.expenses : [],
    inventoryMovements: Array.isArray(raw.inventoryMovements) ? raw.inventoryMovements : [],
    projects: Array.isArray(raw.projects) ? raw.projects : [],
    audit: Array.isArray(raw.audit) ? raw.audit : []
  };
}
