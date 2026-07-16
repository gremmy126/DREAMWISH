// All monetary amounts are integers in the smallest currency unit (KRW won).
// Never derive stored amounts from floating point arithmetic.

export type ErpOrderStatus = "draft" | "confirmed" | "fulfilled" | "cancelled";
export type ErpInvoiceStatus =
  | "draft"
  | "sent"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled";
export type ErpProjectStatus = "active" | "completed" | "on_hold" | "cancelled";
export type ErpInventoryMovementType = "in" | "out" | "adjust";
export type ErpPaymentMethod = "transfer" | "card" | "cash" | "other";
export type ErpExpenseCategory =
  | "purchase"
  | "salary"
  | "rent"
  | "marketing"
  | "software"
  | "tax"
  | "travel"
  | "other";

export type ErpVendor = {
  ownerId: string;
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  memo: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ErpProduct = {
  ownerId: string;
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  unitPrice: number;
  costPrice: number;
  stockQuantity: number;
  lowStockThreshold: number;
  memo: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ErpOrderItem = {
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export type ErpOrder = {
  ownerId: string;
  id: string;
  customerId: string | null;
  customerName: string;
  projectId: string | null;
  status: ErpOrderStatus;
  items: ErpOrderItem[];
  totalAmount: number;
  orderedAt: string;
  fulfilledAt: string | null;
  memo: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ErpInvoice = {
  ownerId: string;
  id: string;
  orderId: string | null;
  customerId: string | null;
  customerName: string;
  projectId: string | null;
  status: ErpInvoiceStatus;
  items: ErpOrderItem[];
  totalAmount: number;
  paidAmount: number;
  issuedAt: string;
  dueAt: string | null;
  paidAt: string | null;
  memo: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ErpPayment = {
  ownerId: string;
  id: string;
  invoiceId: string;
  customerId: string | null;
  customerName: string;
  projectId: string | null;
  amount: number;
  method: ErpPaymentMethod;
  paidAt: string;
  memo: string;
  createdAt: string;
};

export type ErpExpense = {
  ownerId: string;
  id: string;
  vendorId: string | null;
  vendorName: string;
  projectId: string | null;
  category: ErpExpenseCategory;
  amount: number;
  spentAt: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ErpInventoryMovement = {
  ownerId: string;
  id: string;
  productId: string;
  productName: string;
  type: ErpInventoryMovementType;
  quantity: number;
  reason: string;
  referenceId: string | null;
  createdAt: string;
};

export type ErpProject = {
  ownerId: string;
  id: string;
  name: string;
  customerId: string | null;
  customerName: string;
  status: ErpProjectStatus;
  budgetAmount: number;
  startedAt: string | null;
  endedAt: string | null;
  memo: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ErpAuditEvent = {
  ownerId: string;
  id: string;
  action: string;
  entityId: string;
  createdAt: string;
};

export function assertMoneyAmount(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer amount in KRW.`);
  }
}

export function assertQuantity(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer quantity.`);
  }
}

export function resolveInvoiceDisplayStatus(
  invoice: Pick<ErpInvoice, "status" | "dueAt">,
  now: Date = new Date()
): ErpInvoiceStatus {
  if (
    (invoice.status === "sent" || invoice.status === "partially_paid") &&
    invoice.dueAt &&
    new Date(invoice.dueAt).getTime() < now.getTime()
  ) {
    return "overdue";
  }
  return invoice.status;
}

export function invoiceOutstandingAmount(
  invoice: Pick<ErpInvoice, "status" | "totalAmount" | "paidAmount">
): number {
  if (invoice.status === "cancelled" || invoice.status === "draft") return 0;
  return Math.max(0, invoice.totalAmount - invoice.paidAmount);
}
