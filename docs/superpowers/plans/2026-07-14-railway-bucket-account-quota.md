# Railway Bucket Account Quota Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist production file originals in a private Railway Bucket, preserve JSON state on `/data`, and enforce and display a 10 GiB owner-scoped account quota.

**Architecture:** Keep the existing `file-storage.ts` public API and select a local filesystem backend for development/tests or an S3-compatible Railway Bucket backend for production. Calculate quota from owner-scoped records, serialize same-owner uploads through a quota lock, and fail closed when production bucket configuration is missing.

**Tech Stack:** Next.js 15, TypeScript, Node.js filesystem, Railway S3-compatible Storage Buckets, `@aws-sdk/client-s3`, owner-scoped JSON repositories.

## Global Constraints

- `ACCOUNT_STORAGE_QUOTA_BYTES` is exactly `10 * 1024 * 1024 * 1024`.
- Browser `localStorage` is not counted and is not assigned a 10 GiB quota.
- Individual files remain limited to 25 MiB.
- Production never silently falls back from a missing Bucket to ephemeral disk.
- Bucket credentials, bucket name, endpoint, and raw object keys never reach client JSON.
- All usage and writes derive owner identity from the authenticated session.
- Existing unrelated untracked files are not staged or modified.

---

### Task 1: Ten-GiB quota metrics

**Files:**
- Create: `src/lib/storage/account-storage-quota.ts`
- Modify: `src/lib/storage/account-storage.ts`
- Modify: `app/api/storage/usage/route.ts`
- Test: `tests/account-storage-usage.test.ts`
- Test: `tests/storage-status.test.ts`

**Interfaces:**
- Produces: `ACCOUNT_STORAGE_QUOTA_BYTES`, `getStorageCapacity(usageBytes)`, and API fields `remainingBytes`, `percentUsed`.
- Consumes: owner-scoped `calculateAccountStorageUsage(ownerId)` breakdown.

- [ ] **Step 1: Write failing quota tests**

```ts
test("account storage quota is ten GiB", async () => {
  const { ACCOUNT_STORAGE_QUOTA_BYTES, getStorageCapacity } = await import("../src/lib/storage/account-storage-quota");
  assert.equal(ACCOUNT_STORAGE_QUOTA_BYTES, 10 * 1024 * 1024 * 1024);
  assert.deepEqual(getStorageCapacity(ACCOUNT_STORAGE_QUOTA_BYTES / 4), {
    quotaBytes: ACCOUNT_STORAGE_QUOTA_BYTES,
    remainingBytes: ACCOUNT_STORAGE_QUOTA_BYTES * 0.75,
    percentUsed: 25
  });
});

test("account storage API returns a real quota for every owner", async () => {
  await withTempDataDir(async () => {
    const usage = await calculateAccountStorageUsage("owner-a");
    assert.equal(usage.quotaBytes, 10 * 1024 * 1024 * 1024);
    assert.equal(usage.remainingBytes, usage.quotaBytes - usage.usageBytes);
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test`

Expected: FAIL because the quota module and response fields do not exist.

- [ ] **Step 3: Implement quota metrics**

```ts
export const ACCOUNT_STORAGE_QUOTA_BYTES = 10 * 1024 * 1024 * 1024;

export function getStorageCapacity(usageBytes: number) {
  const usage = Math.max(0, usageBytes);
  return {
    quotaBytes: ACCOUNT_STORAGE_QUOTA_BYTES,
    remainingBytes: Math.max(0, ACCOUNT_STORAGE_QUOTA_BYTES - usage),
    percentUsed: Math.min(100, (usage / ACCOUNT_STORAGE_QUOTA_BYTES) * 100)
  };
}
```

Spread `getStorageCapacity(usageBytes)` into `calculateAccountStorageUsage` and update `AccountStorageUsage` fields.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test`

Expected: owner isolation and 10 GiB metrics pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/account-storage-quota.ts src/lib/storage/account-storage.ts app/api/storage/usage/route.ts tests/account-storage-usage.test.ts tests/storage-status.test.ts
git commit -m "feat: add ten gigabyte account quota"
```

---

### Task 2: Railway Bucket storage backend

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/files/file-storage.types.ts`
- Create: `src/lib/files/local-file-storage.ts`
- Create: `src/lib/files/railway-bucket-storage.ts`
- Modify: `src/lib/files/file-storage.ts`
- Test: `tests/durable-files.test.ts`

**Interfaces:**
- Produces: `FileStorageBackend` with `put`, `get`, `delete`; `getFileStorageBackend()`; existing `storeOwnerFile`, `readOwnerFile`, `deleteOwnerFile` signatures remain stable.
- Consumes: `STORAGE_BUCKET_NAME`, `STORAGE_BUCKET_ACCESS_KEY_ID`, `STORAGE_BUCKET_SECRET_ACCESS_KEY`, `STORAGE_BUCKET_REGION`, `STORAGE_BUCKET_ENDPOINT`.

- [ ] **Step 1: Install S3 dependencies**

Run: `npm install @aws-sdk/client-s3`

Expected: `package.json` and `package-lock.json` include `@aws-sdk/client-s3`.

- [ ] **Step 2: Write failing backend tests**

```ts
test("production storage fails closed when Railway Bucket configuration is missing", async () => {
  const { readBucketStorageConfig } = await import("../src/lib/files/railway-bucket-storage");
  assert.throws(() => readBucketStorageConfig({}), /STORAGE_BACKEND_UNAVAILABLE/u);
});

test("bucket object keys contain only owner hash and file id", async () => {
  const { createOwnerStorageKey } = await import("../src/lib/files/file-storage");
  const key = createOwnerStorageKey("owner@example.com", "file-1");
  assert.match(key, /^owners\/[a-f0-9]{32}\/files\/file-1$/u);
  assert.doesNotMatch(key, /owner@example\.com/u);
});

test("local backend keeps the existing owner-isolated byte round trip", async () => {
  await withTempData(async () => {
    const stored = await storeOwnerFile({ ownerId: "owner-a", fileId: "file-1", bytes: Buffer.from("hello") });
    assert.equal((await readOwnerFile("owner-a", stored.storageKey)).toString(), "hello");
    await assert.rejects(() => readOwnerFile("owner-b", stored.storageKey), /FILE_NOT_FOUND/u);
  });
});
```

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test`

Expected: FAIL because the bucket module and new object-key helper do not exist.

- [ ] **Step 4: Define the backend interface and local adapter**

```ts
export type FileStorageBackend = {
  put(key: string, bytes: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
};
```

Move filesystem reads and writes into `local-file-storage.ts`; keep atomic temporary-file rename behavior.

- [ ] **Step 5: Implement Railway Bucket adapter**

```ts
export function readBucketStorageConfig(env: NodeJS.ProcessEnv) {
  const config = {
    bucket: env.STORAGE_BUCKET_NAME?.trim(),
    accessKeyId: env.STORAGE_BUCKET_ACCESS_KEY_ID?.trim(),
    secretAccessKey: env.STORAGE_BUCKET_SECRET_ACCESS_KEY?.trim(),
    region: env.STORAGE_BUCKET_REGION?.trim() || "auto",
    endpoint: env.STORAGE_BUCKET_ENDPOINT?.trim()
  };
  if (!config.bucket || !config.accessKeyId || !config.secretAccessKey || !config.endpoint) {
    throw new Error("STORAGE_BACKEND_UNAVAILABLE");
  }
  return config as Required<typeof config>;
}
```

Use `S3Client`, `PutObjectCommand`, `GetObjectCommand`, and `DeleteObjectCommand`. Convert `GetObjectCommand` body with `transformToByteArray()` and map missing objects to `FILE_NOT_FOUND`.

- [ ] **Step 6: Select backend without production fallback**

```ts
function getFileStorageBackend() {
  if (process.env.NODE_ENV === "production") return createRailwayBucketStorage(process.env);
  return createLocalFileStorage();
}
```

`createOwnerStorageKey` returns `owners/<ownerHash>/files/<fileId>` and every read/delete validates that the key belongs to the authenticated owner before calling the backend.

- [ ] **Step 7: Run tests and verify GREEN**

Run: `npm test`

Expected: local round trip, fail-closed configuration, and owner-key tests pass.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/lib/files/file-storage.types.ts src/lib/files/local-file-storage.ts src/lib/files/railway-bucket-storage.ts src/lib/files/file-storage.ts tests/durable-files.test.ts
git commit -m "feat: store production files in Railway Bucket"
```

---

### Task 3: Owner quota enforcement on upload

**Files:**
- Modify: `src/lib/storage/account-storage-quota.ts`
- Modify: `app/api/files/route.ts`
- Test: `tests/account-storage-usage.test.ts`
- Test: `tests/durable-files.test.ts`

**Interfaces:**
- Produces: `withAccountStorageCapacity<T>(ownerId, incomingBytes, operation): Promise<T>`.
- Consumes: `calculateAccountStorageUsage(ownerId)`, `storeOwnerFile`, and owner-scoped mutex.

- [ ] **Step 1: Write failing boundary and route tests**

```ts
test("quota allows an exact fit and rejects one byte over", async () => {
  const { ACCOUNT_STORAGE_QUOTA_BYTES, assertStorageCapacity } = await import("../src/lib/storage/account-storage-quota");
  assert.doesNotThrow(() => assertStorageCapacity(ACCOUNT_STORAGE_QUOTA_BYTES - 1, 1));
  assert.throws(() => assertStorageCapacity(ACCOUNT_STORAGE_QUOTA_BYTES, 1), /STORAGE_QUOTA_EXCEEDED/u);
});

test("file upload checks quota before storing bytes", async () => {
  const source = await fs.readFile("app/api/files/route.ts", "utf8");
  assert.match(source, /withAccountStorageCapacity/u);
  assert.match(source, /STORAGE_QUOTA_EXCEEDED/u);
  assert.match(source, /status:\s*413/u);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test`

Expected: FAIL because capacity assertion and route enforcement are absent.

- [ ] **Step 3: Implement capacity assertion and owner lock**

```ts
export function assertStorageCapacity(usageBytes: number, incomingBytes: number) {
  if (Math.max(0, usageBytes) + Math.max(0, incomingBytes) > ACCOUNT_STORAGE_QUOTA_BYTES) {
    throw new Error("STORAGE_QUOTA_EXCEEDED");
  }
}
```

Implement `withAccountStorageCapacity` with an owner-hash lock path under `DATA_DIR/quota-locks`, calculate fresh usage inside the lock, assert capacity, then run the supplied operation.

- [ ] **Step 4: Wrap the upload transaction**

Move `storeOwnerFile` and `saveFileRecord` inside `withAccountStorageCapacity(owner.uid, upload.size, async () => ...)`. Preserve compensation: delete the new object and metadata when metadata persistence fails. Map `STORAGE_QUOTA_EXCEEDED` to HTTP 413 with `code` and Korean error copy.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm test`

Expected: exact-fit, over-quota, compensation, and route tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/account-storage-quota.ts app/api/files/route.ts tests/account-storage-usage.test.ts tests/durable-files.test.ts
git commit -m "feat: enforce owner storage quota"
```

---

### Task 4: Storage percentage UI and operator configuration

**Files:**
- Modify: `components/Common/StorageStatus.tsx`
- Modify: `components/Files/FilesView.tsx`
- Modify: `src/lib/i18n/translations.ts`
- Modify: `.env.example`
- Modify: `docs/railway-auth-and-memory.md`
- Test: `tests/account-storage-usage.test.ts`
- Test: `tests/files-ui.test.ts`

**Interfaces:**
- Consumes: `usageBytes`, `quotaBytes`, `remainingBytes`, `percentUsed` from `/api/storage/usage`.
- Produces: visible `used / 10 GB`, percentage label, remaining amount, and refresh after file upload.

- [ ] **Step 1: Write failing UI and configuration tests**

```ts
test("storage UI shows remaining capacity and ten gigabyte limit", async () => {
  const source = await fs.readFile("components/Common/StorageStatus.tsx", "utf8");
  assert.match(source, /remainingBytes/u);
  assert.match(source, /storage\.remaining/u);
  assert.match(source, /percentUsed/u);
});

test("successful file uploads refresh account storage", async () => {
  const source = await fs.readFile("components/Files/FilesView.tsx", "utf8");
  assert.match(source, /dreamwish:storage-updated/u);
});

test("Railway bucket variables are documented without values", async () => {
  const env = await fs.readFile(".env.example", "utf8");
  for (const name of ["STORAGE_BUCKET_NAME", "STORAGE_BUCKET_ACCESS_KEY_ID", "STORAGE_BUCKET_SECRET_ACCESS_KEY", "STORAGE_BUCKET_REGION", "STORAGE_BUCKET_ENDPOINT"]) assert.match(env, new RegExp(`^${name}=`, "mu"));
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test`

Expected: FAIL on remaining capacity, refresh event, and bucket variables.

- [ ] **Step 3: Implement UI fields and refresh**

Extend `StorageInfo` with `remainingBytes` and `percentUsed`. Render the server-provided percentage with two decimals while retaining `calculateStoragePercent` for progress-bar clamping. Add `storage.remaining` translations. After a successful upload, dispatch:

```ts
window.dispatchEvent(new Event("dreamwish:storage-updated"));
```

- [ ] **Step 4: Document production variables and `/data`**

Add empty server-only variables to `.env.example`. Update `docs/railway-auth-and-memory.md` with:

```text
1. Attach dreamwish-data to DREAMWISH at /data and set DATA_DIR=/data.
2. Create private dreamwish-files Bucket in production.
3. Inject BUCKET, ACCESS_KEY_ID, SECRET_ACCESS_KEY, REGION, ENDPOINT as STORAGE_BUCKET_* reference variables.
4. Never paste Bucket secrets into NEXT_PUBLIC_* variables.
```

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm test`

Expected: storage UI, upload refresh, env documentation, and all existing tests pass.

- [ ] **Step 6: Run full verification**

Run: `npm run typecheck && npm run lint && npm run build`

Expected: every command exits 0 and the production build includes `/api/storage/usage`, `/api/files`, and `/api/business/messages/sync`.

- [ ] **Step 7: Commit**

```bash
git add components/Common/StorageStatus.tsx components/Files/FilesView.tsx src/lib/i18n/translations.ts .env.example docs/railway-auth-and-memory.md tests/account-storage-usage.test.ts tests/files-ui.test.ts
git commit -m "feat: show Railway-backed storage capacity"
```

---

### Task 5: Railway production resources and smoke verification

**Files:**
- No repository file changes.

**Interfaces:**
- Consumes: verified code, `dreamwish-data`, `dreamwish-files`, reference variables.
- Produces: durable production storage and a successful deployment.

- [ ] **Step 1: Correct the blocked service region**

In Railway `vivacious-reflection` → `DREAMWISH` → Settings, replace the invalid `asia-southeast1-eqsg3a` region with the currently offered Singapore region. Do not change replicas, CPU, memory, domains, or restart policy.

- [ ] **Step 2: Create and attach persistent metadata storage**

Create a 5 GB Volume named `dreamwish-data`, attach it only to `DREAMWISH`, mount at `/data`, and set `DATA_DIR=/data`. Do not wipe or resize `postgres-volume`.

- [ ] **Step 3: Create and connect the private Bucket**

Create production Bucket `dreamwish-files` in Singapore. Auto-inject its credentials into `DREAMWISH`, mapping Railway-provided values to the five `STORAGE_BUCKET_*` variables. Do not expose them as `NEXT_PUBLIC_*`.

- [ ] **Step 4: Deploy the verified commit**

Trigger one deployment from the verified repository commit. Expected: build and health checks succeed; both `DREAMWISH` and PostgreSQL remain Online.

- [ ] **Step 5: Smoke-test production**

Verify with one authenticated test account:

```text
- Storage widget shows 10 GB and a numeric percentage.
- Upload, download, and delete/rollback paths work for a small text file.
- Reopening after a deployment keeps metadata and file bytes.
- Gmail reconnect requests Gmail read scope.
- Business Mail shows latest conversations or the explicit latest-50 empty state.
```

- [ ] **Step 6: Stop on any failed production check**

Do not reset credentials, wipe volumes, delete buckets, or stack additional deployment changes. Preserve logs and return to the failing task with one hypothesis at a time.

