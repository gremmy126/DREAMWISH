import { createHash } from "node:crypto";
import path from "node:path";
import { getDataDirectory } from "../local-db/json-store";
import { withStoreMutex } from "../local-db/store-mutex";

export const ACCOUNT_STORAGE_QUOTA_BYTES = 10 * 1024 * 1024 * 1024;

export function getStorageCapacity(usageBytes: number) {
  const normalizedUsage = Math.max(0, usageBytes);
  return {
    quotaBytes: ACCOUNT_STORAGE_QUOTA_BYTES,
    remainingBytes: Math.max(0, ACCOUNT_STORAGE_QUOTA_BYTES - normalizedUsage),
    percentUsed: Math.min(
      100,
      (normalizedUsage / ACCOUNT_STORAGE_QUOTA_BYTES) * 100
    )
  };
}

export function assertStorageCapacity(
  usageBytes: number,
  incomingBytes: number
) {
  const total = Math.max(0, usageBytes) + Math.max(0, incomingBytes);
  if (total > ACCOUNT_STORAGE_QUOTA_BYTES) {
    throw new Error("STORAGE_QUOTA_EXCEEDED");
  }
}

export async function withAccountStorageCapacity<T>(
  ownerId: string,
  incomingBytes: number,
  operation: () => Promise<T>
) {
  const ownerHash = createHash("sha256").update(ownerId).digest("hex");
  const lockPath = path.join(
    getDataDirectory(),
    "quota-locks",
    `${ownerHash}.lock`
  );
  return withStoreMutex(lockPath, async () => {
    const { calculateAccountStorageUsage } = await import("./account-storage");
    const usage = await calculateAccountStorageUsage(ownerId);
    assertStorageCapacity(usage.usageBytes, incomingBytes);
    return operation();
  });
}
