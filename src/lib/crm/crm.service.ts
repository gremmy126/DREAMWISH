import type { Customer, CustomerMemory } from "./crm.types";
import { listCustomers, upsertCustomer, upsertCustomerMemory } from "./crm.repository";

export async function searchCustomers(ownerId: string, query: string) {
  const terms = tokenize(query);
  const customers = await listCustomers(ownerId);
  if (terms.length === 0) return customers;

  return customers.filter((customer) => {
    const haystack = `${customer.name} ${customer.email} ${customer.phone} ${customer.position} ${customer.tags.join(" ")}`.toLowerCase();
    return terms.some((term) => haystack.includes(term));
  });
}

export async function saveCustomerWithMemory(customer: Customer, memory: CustomerMemory) {
  await upsertCustomer(customer);
  await upsertCustomerMemory(memory);
  return { customer, memory };
}

function tokenize(value: string) {
  return value.toLowerCase().match(/[가-힣a-z0-9_]{2,}/giu) || [];
}
