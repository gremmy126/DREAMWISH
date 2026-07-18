import { assertPublicDns, assertSafeUrlFormat } from "../../deep-research/safe-fetch";
import { sendGmailMessage } from "../../business/outbound-send.service";
import {
  addCrmActivity,
  createCrmDeal,
  createCustomerDraft,
  listCustomers,
  updateCrmDeal,
  updateCustomer
} from "../../crm/crm.repository";
import { searchCustomers } from "../../crm/crm.service";
import { resolveStructuredActionCredential } from "../action-credential.service";
import { adapterImplementationSupports } from "./action-adapter.manifest";
import type { ActionAdapter, ActionAdapterExecutionInput, ActionAdapterExecutionResult } from "./action-adapter.types";
import { arrayValue, booleanValue, compactObject, numberValue, objectValue, text } from "./adapter-utils";
import { executeJsonRequest } from "./oauth-json-client";

export const crmCommerceActionAdapter: ActionAdapter = {
  adapterVersion: 1,
  supports(adapterKey, adapterVersion) {
    return adapterImplementationSupports("crmCommerce", adapterKey, adapterVersion);
  },
  async execute(input) {
    if (input.definition.appId === "crm") return executeDreamwishCrm(input);
    if (!input.connectionId) throw permanent("연결된 비즈니스 앱 계정을 선택하세요.", "CONNECTION_REQUIRED");
    const credential = await resolveStructuredActionCredential(
      input.ownerId,
      input.connectionId,
      input.definition.appId
    );
    if (input.definition.appId === "hubspot") return executeHubSpot(input, credential.values);
    if (input.definition.appId === "salesforce") return executeSalesforce(input, credential.values);
    if (input.definition.appId === "stripe") return executeStripe(input, credential.values);
    return executeShopify(input, credential.values);
  }
};

async function executeDreamwishCrm(input: ActionAdapterExecutionInput): Promise<ActionAdapterExecutionResult> {
  const values = input.normalizedInput;
  const id = input.definition.id;
  if (id === "create-contact") {
    const customer = await createCustomerDraft({
      ownerId: input.ownerId,
      name: text(values, "name"),
      email: text(values, "email"),
      phone: text(values, "phone"),
      companyName: text(values, "company"),
      position: "",
      memo: "Automation에서 생성"
    });
    if (arrayValue(values, "tags").length > 0) {
      await updateCustomer(input.ownerId, customer.id, { tags: arrayValue(values, "tags").map(String) });
    }
    return localResult(customer);
  }
  if (id === "update-contact") {
    const customer = await updateCustomer(input.ownerId, text(values, "contactId"), compactObject({
      name: text(values, "name") || undefined,
      email: text(values, "email") || undefined,
      phone: text(values, "phone") || undefined,
      tags: values.tags ? arrayValue(values, "tags").map(String) : undefined
    }));
    if (!customer) throw permanent("CRM 연락처를 찾을 수 없습니다.", "ACTION_TARGET_NOT_FOUND");
    return localResult(customer);
  }
  if (id === "create-deal") {
    const deal = await createCrmDeal({
      ownerId: input.ownerId,
      customerId: text(values, "contactId"),
      title: text(values, "title"),
      value: numberValue(values, "amount"),
      stage: crmStage(text(values, "stage"))
    });
    if (!deal) throw permanent("CRM 연락처를 찾을 수 없습니다.", "ACTION_TARGET_NOT_FOUND");
    return localResult(deal);
  }
  if (id === "update-deal") {
    const deal = await updateCrmDeal(input.ownerId, text(values, "dealId"), compactObject({
      title: text(values, "title") || undefined,
      value: values.amount === undefined ? undefined : numberValue(values, "amount"),
      stage: values.stage ? crmStage(text(values, "stage")) : undefined
    }));
    if (!deal) throw permanent("CRM 거래를 찾을 수 없습니다.", "ACTION_TARGET_NOT_FOUND");
    return localResult(deal);
  }
  if (id === "create-activity" || id === "create-note") {
    const activity = await addCrmActivity(input.ownerId, {
      customerId: text(values, "contactId"),
      type: id === "create-note" ? "note" : crmActivityType(text(values, "type")),
      title: id === "create-note" ? "Automation 메모" : text(values, "title"),
      body: id === "create-note" ? text(values, "content") : text(values, "occurredAt")
    });
    if (!activity) throw permanent("CRM 연락처를 찾을 수 없습니다.", "ACTION_TARGET_NOT_FOUND");
    return localResult(activity);
  }
  if (id === "send-email") {
    const contactId = text(values, "contactId");
    const customer = (await listCustomers(input.ownerId)).find((candidate) => candidate.id === contactId);
    if (!customer?.email) throw permanent("CRM 연락처에 이메일 주소가 없습니다.", "ACTION_TARGET_NOT_FOUND");
    const sent = await sendGmailMessage(input.ownerId, {
      to: customer.email,
      subject: text(values, "subject"),
      body: text(values, "body")
    });
    if (!sent.ok) throw permanent(sent.error, sent.code === "reconnect_required" ? "CONNECTION_REQUIRED" : "ACTION_FAILED");
    return { output: { id: sent.messageId, status: "sent", contactId } };
  }
  const customers = await searchCustomers(input.ownerId, text(values, "query"));
  return { output: { items: customers.slice(0, Math.max(1, numberValue(values, "limit", 25))), count: customers.length } };
}

function executeHubSpot(input: ActionAdapterExecutionInput, credential: Record<string, string>) {
  const token = required(credential.privateAppToken, "HubSpot Private App Token");
  const objectType = ({ contact: "contacts", deal: "deals", company: "companies" } as const)[
    input.definition.id.replace(/^create-/u, "") as "contact" | "deal" | "company"
  ];
  return executeJsonRequest(input, {
    url: `https://api.hubapi.com/crm/v3/objects/${objectType}`,
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: { properties: objectValue(input.normalizedInput, "properties") }
  });
}

async function executeSalesforce(input: ActionAdapterExecutionInput, credential: Record<string, string>) {
  const origin = assertSafeUrlFormat(required(credential.instanceUrl, "Salesforce Instance URL")).origin;
  const hostname = new URL(origin).hostname.toLowerCase();
  if (!hostname.endsWith(".salesforce.com") && !hostname.endsWith(".force.com")) {
    throw permanent("Salesforce Instance URL 도메인을 확인하세요.", "CREDENTIAL_INVALID");
  }
  await assertPublicDns(hostname);
  const resource = input.definition.id.replace(/^create-/u, "");
  const objectName = resource === "lead" ? "Lead" : resource === "opportunity" ? "Opportunity" : "Account";
  return executeJsonRequest(input, {
    url: `${origin}/services/data/v61.0/sobjects/${objectName}`,
    method: "POST",
    headers: { Authorization: `Bearer ${required(credential.accessToken, "Salesforce Access Token")}` },
    body: objectValue(input.normalizedInput, "properties")
  });
}

function executeStripe(input: ActionAdapterExecutionInput, credential: Record<string, string>) {
  const values = input.normalizedInput;
  const id = input.definition.id;
  let path: string;
  let method = "POST";
  const form = new URLSearchParams();
  if (id === "create-payment") {
    path = "/v1/payment_intents";
    append(form, "amount", numberValue(values, "amount"));
    append(form, "currency", text(values, "currency").toLowerCase());
    append(form, "customer", text(values, "customerId"));
    append(form, "description", text(values, "description"));
    append(form, "automatic_payment_methods[enabled]", "true");
  } else if (id === "create-customer") {
    path = "/v1/customers";
    append(form, "email", text(values, "email"));
    append(form, "name", text(values, "name"));
    for (const [key, value] of Object.entries(objectValue(values, "metadata"))) append(form, `metadata[${key}]`, String(value));
  } else if (id === "refund") {
    path = "/v1/refunds";
    append(form, "payment_intent", text(values, "paymentIntentId"));
    if (values.amount !== undefined) append(form, "amount", numberValue(values, "amount"));
    append(form, "reason", stripeReason(text(values, "reason")));
  } else if (id === "cancel-payment") {
    path = `/v1/payment_intents/${segment(text(values, "paymentIntentId"))}/cancel`;
    append(form, "cancellation_reason", cancellationReason(text(values, "reason")));
  } else if (id === "create-subscription") {
    path = "/v1/subscriptions";
    append(form, "customer", text(values, "customerId"));
    append(form, "items[0][price]", text(values, "priceId"));
    append(form, "items[0][quantity]", numberValue(values, "quantity", 1));
  } else {
    path = `/v1/subscriptions/${segment(text(values, "subscriptionId"))}`;
    if (booleanValue(values, "atPeriodEnd")) append(form, "cancel_at_period_end", "true");
    else method = "DELETE";
  }
  return executeJsonRequest(input, {
    url: `https://api.stripe.com${path}`,
    method,
    headers: {
      Authorization: `Bearer ${required(credential.apiKey, "Stripe API Key")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": input.idempotencyKey
    },
    rawBody: form
  });
}

async function executeShopify(input: ActionAdapterExecutionInput, credential: Record<string, string>) {
  const storeDomain = required(credential.storeDomain, "Shopify Store Domain").toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/u.test(storeDomain)) {
    throw permanent("Shopify Store Domain은 store.myshopify.com 형식이어야 합니다.", "CREDENTIAL_INVALID");
  }
  const values = input.normalizedInput;
  const id = input.definition.id;
  if (id === "create-product") {
    const created = await shopifyGraphql(input, credential, `
      mutation ProductCreate($product: ProductCreateInput!) {
        productCreate(product: $product) { product { id title } userErrors { field message } }
      }`, { product: compactObject({ title: text(values, "title"), descriptionHtml: text(values, "description") || undefined, vendor: text(values, "vendor") || undefined }) });
    const variants = objectOrArray(values.variants);
    const productId = nestedString(created.output, ["data", "productCreate", "product", "id"]);
    if (variants.length && productId) {
      return shopifyGraphql(input, credential, `
        mutation VariantsCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkCreate(productId: $productId, variants: $variants) { productVariants { id title } userErrors { field message } }
        }`, { productId, variants });
    }
    return created;
  }
  if (id === "update-product") {
    return shopifyGraphql(input, credential, `
      mutation ProductUpdate($product: ProductUpdateInput!) {
        productUpdate(product: $product) { product { id title status } userErrors { field message } }
      }`, { product: compactObject({ id: gid("Product", text(values, "productId")), title: text(values, "title") || undefined, descriptionHtml: text(values, "description") || undefined, status: text(values, "status") || undefined }) });
  }
  if (id === "create-order") {
    return shopifyGraphql(input, credential, `
      mutation OrderCreate($order: OrderCreateOrderInput!) {
        orderCreate(order: $order) { order { id name } userErrors { field message } }
      }`, { order: compactObject({ customerId: gid("Customer", text(values, "customerId")), lineItems: objectOrArray(values.lineItems), currency: text(values, "currency") || undefined }) });
  }
  if (id === "cancel-order") {
    return shopifyGraphql(input, credential, `
      mutation OrderCancel($orderId: ID!, $reason: OrderCancelReason!, $restock: Boolean!) {
        orderCancel(orderId: $orderId, reason: $reason, restock: $restock) { job { id done } orderCancelUserErrors { field message code } }
      }`, { orderId: gid("Order", text(values, "orderId")), reason: shopifyCancelReason(text(values, "reason")), restock: booleanValue(values, "restock") });
  }
  return shopifyGraphql(input, credential, `
    mutation InventorySet($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) { inventoryAdjustmentGroup { createdAt } userErrors { field message code } }
    }`, { input: { name: "available", reason: "correction", ignoreCompareQuantity: true, quantities: [{ inventoryItemId: gid("InventoryItem", text(values, "inventoryItemId")), locationId: gid("Location", text(values, "locationId")), quantity: numberValue(values, "quantity") }] } });
}

async function shopifyGraphql(
  input: ActionAdapterExecutionInput,
  credential: Record<string, string>,
  query: string,
  variables: Record<string, unknown>
) {
  const result = await executeJsonRequest(input, {
    url: `https://${credential.storeDomain.toLowerCase()}/admin/api/2026-07/graphql.json`,
    method: "POST",
    headers: { "X-Shopify-Access-Token": required(credential.adminAccessToken, "Shopify Admin Access Token") },
    body: { query, variables }
  });
  const errors = collectUserErrors(result.output);
  if (Array.isArray(result.output.errors) && result.output.errors.length) {
    throw permanent("Shopify GraphQL 요청이 거부되었습니다.");
  }
  if (errors.length) throw permanent(`Shopify 요청이 거부되었습니다: ${errors[0]}`);
  return result;
}

function localResult(value: { id: string }) {
  return { output: { ...value, status: "completed" } };
}

function required(value: string | undefined, label: string) {
  if (!value?.trim()) throw permanent(`${label}을 확인하세요.`, "CREDENTIAL_INVALID");
  return value.trim();
}

function segment(value: string) { return encodeURIComponent(required(value, "Resource ID")); }
function append(form: URLSearchParams, key: string, value: string | number) { if (String(value).trim()) form.set(key, String(value)); }
function stripeReason(value: string) { return ["duplicate", "fraudulent", "requested_by_customer"].includes(value) ? value : "requested_by_customer"; }
function cancellationReason(value: string) { return ["duplicate", "fraudulent", "requested_by_customer", "abandoned"].includes(value) ? value : "requested_by_customer"; }
function shopifyCancelReason(value: string) { const normalized = value.trim().toUpperCase(); return ["CUSTOMER", "DECLINED", "FRAUD", "INVENTORY", "STAFF", "OTHER"].includes(normalized) ? normalized : "OTHER"; }
function gid(type: string, value: string) { return value.startsWith("gid://shopify/") ? value : `gid://shopify/${type}/${value}`; }
function objectOrArray(value: unknown): unknown[] { return Array.isArray(value) ? value : value && typeof value === "object" ? [value] : []; }
function nestedString(value: Record<string, unknown>, path: string[]) { let current: unknown = value; for (const key of path) current = current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined; return typeof current === "string" ? current : ""; }
function collectUserErrors(value: unknown): string[] { if (Array.isArray(value)) return value.flatMap(collectUserErrors); if (!value || typeof value !== "object") return []; const record = value as Record<string, unknown>; const own = Array.isArray(record.userErrors) || Array.isArray(record.orderCancelUserErrors) ? [...(Array.isArray(record.userErrors) ? record.userErrors : []), ...(Array.isArray(record.orderCancelUserErrors) ? record.orderCancelUserErrors : [])].flatMap((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).message === "string" ? [String((item as Record<string, unknown>).message)] : []) : []; return [...own, ...Object.values(record).flatMap(collectUserErrors)]; }
function crmStage(value: string): "discovery" | "contacted" | "proposal" | "negotiation" | "won" | "lost" { return ["discovery", "contacted", "proposal", "negotiation", "won", "lost"].includes(value) ? value as "discovery" : "discovery"; }
function crmActivityType(value: string): "meeting" | "call" | "task" { return value === "meeting" || value === "task" ? value : "call"; }

function permanent(message: string, code = "ACTION_FAILED") {
  return Object.assign(new Error(message), { code, retryable: false });
}
