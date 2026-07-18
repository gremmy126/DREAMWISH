# DREAMWISH Local Agent and Local Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an installable per-user Local Agent that stores chat, approved memory, research, and documents on the user's PC and connects to Railway through an outbound, end-to-end encrypted relay.

**Architecture:** A Tauri 2 tray application owns keys, SQLCipher, Markdown Vault, local service health, and checkpoints. Its hidden WebView runs Transformers.js for local embeddings, while a separate Railway WebSocket relay routes opaque encrypted frames between the authenticated browser and paired Agent without persisting content.

**Tech Stack:** Tauri 2.11.5, Rust stable, React 19, TypeScript 5.7, Vite, SQLCipher 4.16.0 through rusqlite 0.40.1, sqlite-vec 0.1.9, tauri-plugin-stronghold 2.3.1, Transformers.js 4.2.0, P-256 ECDH/ECDSA, AES-256-GCM, Node 22 `ws`, Next.js 15.

## Global Constraints

- The Agent opens no public listening port; all remote traffic is outbound HTTPS/WSS to an allowlisted DREAMWISH origin.
- Agent private keys, SQLCipher keys, local model tokens, plaintext prompts, documents, and decrypted relay frames never leave the user's PC except owner-approved CRM/ERP requests and encrypted browser sessions.
- Railway stores account, plan, pairing public keys, capability/status metadata, and minimal audit records only; it never stores local chat or research plaintext.
- Markdown source files remain standard UTF-8 and user-readable under the OS user profile; indexes, vectors, mappings, checkpoints, and relay outbox are SQLCipher-encrypted.
- All local paths are derived by OS APIs and confined below the Agent data root.
- sqlite-vec is pinned to stable `0.1.9`; extension failure enables an explicit FTS5-only degraded mode.
- Transformers.js is pinned to `4.2.0`; after an approved model download, `allowRemoteModels` is false.
- The model revision and every downloaded file SHA-256 are recorded in a manifest.
- Local execution commands are fixed allowlisted binaries and arguments; no browser-supplied shell string is executed.
- Write a failing test before each implementation and commit every independently testable task.

## File Structure

- `local-agent/`: Tauri application and hidden React runtime.
- `local-agent/src-tauri/src/crypto/`: device identity, ECDH session, AES envelopes, replay checks.
- `local-agent/src-tauri/src/storage/`: directories, SQLCipher, migrations, Vault files, FTS/vector index.
- `local-agent/src/embedding/`: Transformers.js model cache and embedding worker.
- `local-agent/src/services/`: relay connection and local service health state.
- `services/local-agent-relay/`: Railway WebSocket relay process.
- `src/lib/local-agent/`: server pairing records, short-lived tokens, device credentials, browser E2E helpers.
- `app/api/local-agent/**`: authenticated pairing, status, migration, and relay-token APIs.
- `components/Settings/LocalAgentSettingsCard.tsx`: pairing and diagnostics UI.

---

### Task 1: Scaffold and pin the Tauri Agent

**Files:**
- Create: `local-agent/package.json`
- Create: `local-agent/package-lock.json`
- Create: `local-agent/tsconfig.json`
- Create: `local-agent/vite.config.ts`
- Create: `local-agent/index.html`
- Create: `local-agent/src/main.tsx`
- Create: `local-agent/src/App.tsx`
- Create: `local-agent/src-tauri/Cargo.toml`
- Create: `local-agent/src-tauri/tauri.conf.json`
- Create: `local-agent/src-tauri/capabilities/default.json`
- Create: `local-agent/src-tauri/src/main.rs`
- Modify: `.gitignore`
- Test: `tests/local-agent-manifest.test.ts`

**Interfaces:**
- Produces: an installable tray process named `DREAMWISH Local Agent`, Rust command namespace `agent_*`, and locked dependency manifests.
- Consumes: no application runtime code.

- [ ] **Step 1: Write the failing manifest test**

```ts
test("Local Agent pins the approved open-source runtime", () => {
  const pkg = JSON.parse(fs.readFileSync("local-agent/package.json", "utf8"));
  const cargo = fs.readFileSync("local-agent/src-tauri/Cargo.toml", "utf8");
  assert.equal(pkg.dependencies["@huggingface/transformers"], "4.2.0");
  assert.equal(pkg.dependencies["@tauri-apps/api"], "2.11.1");
  assert.equal(pkg.devDependencies["@tauri-apps/cli"], "2.11.4");
  assert.equal(pkg.devDependencies["@vitejs/plugin-react"], "6.0.3");
  assert.equal(pkg.devDependencies.vite, "8.1.3");
  assert.equal(pkg.devDependencies.vitest, "4.1.10");
  for (const version of [...Object.values(pkg.dependencies), ...Object.values(pkg.devDependencies)]) {
    assert.doesNotMatch(String(version), /^(?:latest|next)|[~^*xX]/u);
  }
  assert.match(cargo, /tauri\s*=\s*\{\s*version\s*=\s*"=2\.11\.5"/u);
  assert.match(cargo, /tauri-plugin-stronghold\s*=\s*"=2\.3\.1"/u);
  assert.match(cargo, /rusqlite[\s\S]*version\s*=\s*"=0\.40\.1"/u);
  assert.match(cargo, /sqlite-vec\s*=\s*"=0\.1\.9"/u);
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test`

Expected: FAIL because `local-agent` does not exist.

- [ ] **Step 3: Create the pinned manifests and minimal tray app**

```toml
[dependencies]
tauri = { version = "=2.11.5", features = ["tray-icon"] }
tauri-plugin-stronghold = "=2.3.1"
rusqlite = { version = "=0.40.1", features = ["bundled-sqlcipher-vendored-openssl", "hooks"] }
sqlite-vec = "=0.1.9"
serde = { version = "=1.0.228", features = ["derive"] }
serde_json = "=1.0.145"
thiserror = "=2.0.17"
uuid = { version = "=1.18.1", features = ["v4", "serde"] }
p256 = { version = "=0.13.2", features = ["ecdh", "ecdsa", "pkcs8"] }
aes-gcm = "=0.10.3"
sha2 = "=0.10.9"
zeroize = "=1.8.2"
```

```json
{
  "dependencies": {
    "@huggingface/transformers": "4.2.0",
    "@tauri-apps/api": "2.11.1",
    "react": "19.1.0",
    "react-dom": "19.1.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "2.11.4",
    "@vitejs/plugin-react": "6.0.3",
    "typescript": "5.7.2",
    "vite": "8.1.3",
    "vitest": "4.1.10"
  },
  "scripts": {
    "dev": "tauri dev",
    "build": "tauri build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

Run `npm.cmd --prefix local-agent install --save-exact` once and commit the generated lockfile. The manifest test rejects tags and semver ranges so a later install cannot silently select a different runtime.

- [ ] **Step 4: Restrict Tauri capabilities**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "windows": ["main"],
  "permissions": ["core:default", "stronghold:default"]
}
```

Do not enable generic shell, unrestricted filesystem, localhost server, clipboard, or opener permissions.

- [ ] **Step 5: Run GREEN verification**

Run: `npm.cmd test && npm.cmd --prefix local-agent run typecheck && cargo test --manifest-path local-agent/src-tauri/Cargo.toml`

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add -- local-agent .gitignore tests/local-agent-manifest.test.ts
git commit -m "feat: scaffold pinned DREAMWISH local agent"
```

---

### Task 2: Derive confined OS storage paths and protect the database key

**Files:**
- Create: `local-agent/src-tauri/src/storage/mod.rs`
- Create: `local-agent/src-tauri/src/storage/paths.rs`
- Create: `local-agent/src-tauri/src/storage/secret_store.rs`
- Modify: `local-agent/src-tauri/src/main.rs`
- Test: `local-agent/src-tauri/tests/storage_paths.rs`
- Test: `local-agent/src-tauri/tests/secret_store.rs`

**Interfaces:**
- Produces: `AgentPaths::resolve(app_handle, owner_hash)`, `SecretStore::database_key()`, `SecretStore::device_identity()`.
- Consumes: Tauri app data directory and Stronghold vault.

- [ ] **Step 1: Write failing path-confinement and key-persistence tests**

```rust
#[test]
fn owner_paths_never_escape_the_agent_root() {
    let root = tempdir().unwrap();
    assert!(AgentPaths::from_root(root.path(), "owner-a").unwrap().vault.starts_with(root.path()));
    assert!(AgentPaths::from_root(root.path(), "../escape").is_err());
}

#[test]
fn database_key_is_random_stable_and_not_written_to_plaintext() {
    let first = test_secret_store().database_key().unwrap();
    let second = test_secret_store().database_key().unwrap();
    assert_eq!(first.expose_for_database_open(), second.expose_for_database_open());
    assert!(!walk_test_files().any(|bytes| bytes.windows(first.len()).any(|w| w == first.as_bytes())));
}
```

- [ ] **Step 2: Run RED**

Run: `cargo test --manifest-path local-agent/src-tauri/Cargo.toml`

Expected: FAIL because the storage modules do not exist.

- [ ] **Step 3: Implement owner-hash validation and OS directory creation**

```rust
pub fn validate_owner_hash(value: &str) -> Result<&str, StorageError> {
    if value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit()) {
        Ok(value)
    } else {
        Err(StorageError::InvalidOwnerHash)
    }
}

pub fn confined_join(root: &Path, child: &str) -> Result<PathBuf, StorageError> {
    let value = root.join(child);
    if value.starts_with(root) { Ok(value) } else { Err(StorageError::PathEscape) }
}
```

Create `vault/<owner-hash>/{chats,memory,research,documents}`, `index`, `models`, `checkpoints`, `services`, and `logs` with user-only permissions where the OS supports them.

- [ ] **Step 4: Store a 32-byte SQLCipher key and P-256 private key in Stronghold**

```rust
pub struct SecretBytes(Zeroizing<Vec<u8>>);

impl SecretStore {
    pub fn database_key(&self) -> Result<SecretBytes, SecretStoreError> {
        self.get_or_insert_random("database-key-v1", 32)
    }
}
```

- [ ] **Step 5: Run GREEN verification**

Run: `cargo test --manifest-path local-agent/src-tauri/Cargo.toml`

Expected: all Rust tests pass.

- [ ] **Step 6: Commit**

```powershell
git add -- local-agent/src-tauri/src/storage local-agent/src-tauri/src/main.rs local-agent/src-tauri/tests
git commit -m "feat: secure local agent storage roots and keys"
```

---

### Task 3: Open SQLCipher and apply idempotent schema migrations

**Files:**
- Create: `local-agent/src-tauri/src/storage/database.rs`
- Create: `local-agent/src-tauri/src/storage/migrations.rs`
- Create: `local-agent/src-tauri/migrations/0001_initial.sql`
- Modify: `local-agent/src-tauri/src/storage/mod.rs`
- Test: `local-agent/src-tauri/tests/sqlcipher_database.rs`

**Interfaces:**
- Produces: `AgentDatabase::open(path, key)`, `AgentDatabase::migrate()`, schema version `1`.
- Consumes: `AgentPaths.index_db`, Stronghold database key.

- [ ] **Step 1: Write failing encryption and migration tests**

```rust
#[test]
fn sqlcipher_file_is_encrypted_and_reopens() {
    let (path, key) = test_database_path_and_key();
    let db = AgentDatabase::open(&path, &key).unwrap();
    db.migrate().unwrap();
    db.execute("insert into chat_sessions(id, owner_hash, title, created_at) values (?1, ?2, ?3, ?4)", params!["s1", OWNER, "제목", NOW]).unwrap();
    drop(db);
    assert_ne!(&fs::read(&path).unwrap()[..16], b"SQLite format 3\0");
    assert_eq!(AgentDatabase::open(&path, &key).unwrap().schema_version().unwrap(), 1);
}

#[test]
fn wrong_key_fails_closed() {
    let (path, key) = create_test_database();
    assert!(AgentDatabase::open(&path, &different_key(&key)).is_err());
}
```

- [ ] **Step 2: Run RED**

Run: `cargo test --manifest-path local-agent/src-tauri/Cargo.toml`

Expected: FAIL because no SQLCipher database layer exists.

- [ ] **Step 3: Open, key, verify, and harden the connection**

```rust
let conn = Connection::open(path)?;
conn.pragma_update(None, "key", format!("x'{}'", hex::encode(key.as_bytes())))?;
let cipher_version: String = conn.query_row("PRAGMA cipher_version", [], |row| row.get(0))?;
if cipher_version != "4.16.0" { return Err(DatabaseError::CipherVersion(cipher_version)); }
conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON; PRAGMA trusted_schema=OFF;")?;
```

- [ ] **Step 4: Add the complete initial schema**

```sql
CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE documents(id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, path TEXT NOT NULL, checksum TEXT NOT NULL, mime TEXT NOT NULL, modified_at TEXT NOT NULL, source_type TEXT NOT NULL, indexing_status TEXT NOT NULL);
CREATE TABLE chunks(id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, ordinal INTEGER NOT NULL, heading_path TEXT NOT NULL, text TEXT NOT NULL, token_count INTEGER NOT NULL, UNIQUE(document_id, ordinal));
CREATE VIRTUAL TABLE chunks_fts USING fts5(text, content='chunks', content_rowid='rowid', tokenize='unicode61');
CREATE TABLE chat_sessions(id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE chat_messages(id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE, branch_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE memories(id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, markdown_path TEXT NOT NULL, checksum TEXT NOT NULL, pinned_weight REAL NOT NULL, approved_at TEXT NOT NULL);
CREATE TABLE research_jobs(id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, status TEXT NOT NULL, checkpoint_id TEXT, updated_at TEXT NOT NULL);
CREATE TABLE research_checkpoints(id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE, stage TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE relay_outbox(id TEXT PRIMARY KEY, sequence INTEGER NOT NULL, encrypted_envelope BLOB NOT NULL, attempt INTEGER NOT NULL, next_attempt_at TEXT NOT NULL);
```

- [ ] **Step 5: Run GREEN verification**

Run: `cargo test --manifest-path local-agent/src-tauri/Cargo.toml`

Expected: encryption, wrong-key, idempotent migration, and foreign-key tests pass.

- [ ] **Step 6: Commit**

```powershell
git add -- local-agent/src-tauri/src/storage local-agent/src-tauri/migrations local-agent/src-tauri/tests/sqlcipher_database.rs
git commit -m "feat: add encrypted local agent database"
```

---

### Task 4: Write canonical Markdown Vault files atomically

**Files:**
- Create: `local-agent/src-tauri/src/storage/vault.rs`
- Modify: `local-agent/src-tauri/src/storage/mod.rs`
- Test: `local-agent/src-tauri/tests/markdown_vault.rs`

**Interfaces:**
- Produces: `Vault::save_chat`, `Vault::save_memory`, `Vault::save_research`, `Vault::read_verified`.
- Consumes: confined owner directories and SQLCipher metadata transaction.

- [ ] **Step 1: Write failing round-trip, traversal, and crash-safety tests**

```rust
#[test]
fn korean_markdown_round_trips_with_frontmatter() {
    let saved = vault().save_memory(&ApprovedMemoryFile { id: "m1", title: "고객 기억", content: "드림상사 담당자는 김민수입니다.", tags: vec!["CRM"] }).unwrap();
    assert!(saved.ends_with(".md"));
    assert_eq!(vault().read_verified(&saved).unwrap().content, "드림상사 담당자는 김민수입니다.");
}

#[test]
fn absolute_and_parent_paths_are_rejected() {
    assert!(vault().read_verified(Path::new("../secret.md")).is_err());
    assert!(vault().read_verified(Path::new("C:\\secret.md")).is_err());
}
```

- [ ] **Step 2: Run RED**

Run: `cargo test --manifest-path local-agent/src-tauri/Cargo.toml`

Expected: FAIL because Vault persistence does not exist.

- [ ] **Step 3: Implement atomic UTF-8 Markdown writes**

```rust
let temporary = target.with_extension("md.tmp");
fs::write(&temporary, render_markdown(value).as_bytes())?;
sync_file(&temporary)?;
fs::rename(&temporary, &target)?;
let checksum = sha256_file(&target)?;
database.record_vault_file(&value.id, relative_path(&target)?, &checksum)?;
```

Frontmatter contains only safe IDs, title, ISO timestamps, tags, and source URIs. It never includes OAuth tokens, local paths outside the Vault, or raw provider diagnostics.

- [ ] **Step 4: Run GREEN verification**

Run: `cargo test --manifest-path local-agent/src-tauri/Cargo.toml`

Expected: all Rust tests pass.

- [ ] **Step 5: Commit**

```powershell
git add -- local-agent/src-tauri/src/storage/vault.rs local-agent/src-tauri/src/storage/mod.rs local-agent/src-tauri/tests/markdown_vault.rs
git commit -m "feat: persist local chat memory and research markdown"
```

---

### Task 5: Add FTS5 and sqlite-vec hybrid indexing with fallback

**Files:**
- Create: `local-agent/src-tauri/src/storage/search.rs`
- Create: `local-agent/src-tauri/src/storage/vector_extension.rs`
- Modify: `local-agent/src-tauri/migrations/0001_initial.sql`
- Test: `local-agent/src-tauri/tests/hybrid_search.rs`
- Test: `local-agent/src-tauri/tests/vector_fallback.rs`

**Interfaces:**
- Produces: `SearchIndex::upsert_chunks`, `SearchIndex::hybrid_search`, `SearchCapability { fts5, vector, degraded_reason }`.
- Consumes: 384-dimensional normalized `Vec<f32>` embeddings.

- [ ] **Step 1: Write failing Korean ranking and fallback tests**

```rust
#[test]
fn hybrid_search_combines_fts_vector_recency_and_pin_weight() {
    let result = seeded_index().hybrid_search(SearchQuery { text: "드림상사 담당자", embedding: vec384(), limit: 5 }).unwrap();
    assert_eq!(result.items[0].document_id, "memory-pinned");
    assert!(result.items[0].score >= result.items[1].score);
}

#[test]
fn extension_failure_keeps_fts_results() {
    let index = SearchIndex::open_with_vector_loader(test_db(), |_| Err("wrong architecture".into())).unwrap();
    let result = index.hybrid_search(SearchQuery { text: "담당자", embedding: vec384(), limit: 5 }).unwrap();
    assert!(!result.items.is_empty());
    assert_eq!(result.capability.degraded_reason.as_deref(), Some("SQLITE_VEC_LOAD_FAILED"));
}
```

- [ ] **Step 2: Run RED**

Run: `cargo test --manifest-path local-agent/src-tauri/Cargo.toml`

Expected: FAIL because vector registration and hybrid search do not exist.

- [ ] **Step 3: Register sqlite-vec through the pinned Rust binding**

```rust
unsafe {
    rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute(sqlite_vec::sqlite3_vec_init as *const ())))
};
conn.execute_batch("CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors USING vec0(embedding float[384]);")?;
```

Wrap this call in a capability probe and continue with FTS5 when registration, DDL, or a one-row query fails.

- [ ] **Step 4: Implement deterministic score fusion**

```rust
let score = 0.45 * normalize_bm25(row.bm25)
    + 0.35 * row.vector_similarity
    + 0.10 * row.recency
    + 0.10 * row.pinned_weight;
```

Deduplicate by document checksum and overlapping character range before applying `limit`.

- [ ] **Step 5: Run GREEN verification**

Run: `cargo test --manifest-path local-agent/src-tauri/Cargo.toml`

Expected: vector tests pass when available and the injected failure returns ranked FTS5 results.

- [ ] **Step 6: Commit**

```powershell
git add -- local-agent/src-tauri/src/storage/search.rs local-agent/src-tauri/src/storage/vector_extension.rs local-agent/src-tauri/migrations/0001_initial.sql local-agent/src-tauri/tests/hybrid_search.rs local-agent/src-tauri/tests/vector_fallback.rs
git commit -m "feat: add local hybrid search with vector fallback"
```

---

### Task 6: Cache multilingual-e5-small and generate embeddings offline

**Files:**
- Create: `local-agent/src/embedding/model-manifest.ts`
- Create: `local-agent/src/embedding/embedding-worker.ts`
- Create: `local-agent/src/embedding/embedding-client.ts`
- Create: `local-agent/src/embedding/embedding-worker.test.ts`
- Modify: `local-agent/src/App.tsx`
- Modify: `local-agent/src-tauri/src/main.rs`
- Test: `tests/local-agent-model-cache.test.ts`

**Interfaces:**
- Produces: `ensureEmbeddingModel(consent)`, `embedPassages(texts)`, `embedQuery(text)`, 384-dimensional normalized vectors.
- Consumes: model ID `Xenova/multilingual-e5-small`, pinned revision and manifest hashes.

- [ ] **Step 1: Write failing offline-cache and prefix tests**

```ts
test("embedding worker uses E5 query and passage prefixes", async () => {
  const calls: string[] = [];
  const worker = createEmbeddingWorker(fakePipeline(calls));
  await worker.embedQuery("매출");
  await worker.embedPassages(["이번 달 매출"]);
  assert.deepEqual(calls, ["query: 매출", "passage: 이번 달 매출"]);
});

test("remote model access is disabled after verified installation", () => {
  const source = fs.readFileSync("local-agent/src/embedding/embedding-worker.ts", "utf8");
  assert.match(source, /env\.allowRemoteModels\s*=\s*false/u);
  assert.match(source, /env\.localModelPath/u);
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test && npm.cmd --prefix local-agent test`

Expected: FAIL because the embedding worker and cache manifest do not exist.

- [ ] **Step 3: Implement approved download, checksum verification, and offline load**

```ts
env.cacheDir = await invoke<string>("agent_model_cache_dir");
env.localModelPath = await invoke<string>("agent_model_root");
env.allowRemoteModels = installConsent === true;
const extractor = await pipeline("feature-extraction", MODEL_ID, {
  revision: MODEL_REVISION,
  dtype: "q8"
});
await invoke("agent_verify_model_manifest", { manifest: MODEL_MANIFEST });
env.allowRemoteModels = false;
```

Pool with mean pooling and normalize to unit length. Reject non-finite values and any vector whose length is not 384.

- [ ] **Step 4: Run GREEN verification**

Run: `npm.cmd test && npm.cmd --prefix local-agent run typecheck && npm.cmd --prefix local-agent test`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```powershell
git add -- local-agent/src/embedding local-agent/src/App.tsx local-agent/src-tauri/src/main.rs tests/local-agent-model-cache.test.ts
git commit -m "feat: add offline multilingual local embeddings"
```

---

### Task 7: Pair a Local Agent with an owner-bound public key

**Files:**
- Create: `src/lib/local-agent/local-agent.types.ts`
- Create: `src/lib/local-agent/local-agent.repository.ts`
- Create: `src/lib/local-agent/pairing-token.ts`
- Create: `app/api/local-agent/pairing/route.ts`
- Create: `app/api/local-agent/pairing/complete/route.ts`
- Create: `app/api/local-agent/status/route.ts`
- Create: `components/Settings/LocalAgentSettingsCard.tsx`
- Modify: `components/Settings/SettingsView.tsx`
- Test: `tests/local-agent-pairing.test.ts`
- Test: `tests/local-agent-settings-ui.test.ts`

**Interfaces:**
- Produces: `issueLocalAgentPairing`, `completeLocalAgentPairing`, `getLocalAgentStatus`, public DTO without private material.
- Consumes: `requireOwnerContext`, existing device-pairing patterns, PostgreSQL/JSON owner store.

- [ ] **Step 1: Write failing expiry, one-time, owner-isolation, and DTO tests**

```ts
test("pairing token is owner-bound, one-time, and expires after ten minutes", async () => {
  const token = await issueLocalAgentPairing({ ownerId: ownerA, now });
  await assert.rejects(() => completeLocalAgentPairing({ ownerId: ownerB, token: token.value, publicKeyJwk, now }));
  await completeLocalAgentPairing({ ownerId: ownerA, token: token.value, publicKeyJwk, now });
  await assert.rejects(() => completeLocalAgentPairing({ ownerId: ownerA, token: token.value, publicKeyJwk, now }));
  const expired = await issueLocalAgentPairing({ ownerId: ownerA, now });
  await assert.rejects(() => completeLocalAgentPairing({ ownerId: ownerA, token: expired.value, publicKeyJwk, now: addMinutes(now, 11) }));
});

test("public agent status never serializes secrets", async () => {
  const raw = JSON.stringify(await getLocalAgentStatus(ownerA));
  assert.doesNotMatch(raw, /private|databaseKey|pairingToken|relayToken/iu);
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test`

Expected: FAIL because Local Agent pairing APIs do not exist.

- [ ] **Step 3: Implement hashed one-time tokens and public-key validation**

```ts
const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
const value = randomBytes(32).toString("base64url");
await repository.insertPairing({ ownerId, tokenHash: hashPairingToken(value), expiresAt, consumedAt: null });
return { value, expiresAt, link: `${getAppOrigin()}/local-agent/pair?token=${encodeURIComponent(value)}` };
```

Validate P-256 JWK fields `kty=EC`, `crv=P-256`, bounded base64url `x/y`, and reject extra private `d`.

- [ ] **Step 4: Add the settings card**

Show paired fingerprint, version, capability, last heartbeat, `not_configured|offline|degraded|healthy`, pair/disconnect, and troubleshooting. Never display a raw public key or token by default.

- [ ] **Step 5: Run GREEN verification**

Run: `npm.cmd test && npm.cmd run typecheck && npm.cmd run lint`

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add -- src/lib/local-agent app/api/local-agent components/Settings/LocalAgentSettingsCard.tsx components/Settings/SettingsView.tsx tests/local-agent-pairing.test.ts tests/local-agent-settings-ui.test.ts
git commit -m "feat: pair owner scoped local agents"
```

---

### Task 8: Build the opaque Railway relay and replay-safe envelopes

**Files:**
- Create: `services/local-agent-relay/package.json`
- Create: `services/local-agent-relay/package-lock.json`
- Create: `services/local-agent-relay/src/server.ts`
- Create: `services/local-agent-relay/src/session-registry.ts`
- Create: `services/local-agent-relay/src/protocol.ts`
- Create: `services/local-agent-relay/railway.toml`
- Create: `local-agent/src-tauri/src/crypto/envelope.rs`
- Create: `local-agent/src/services/relay-client.ts`
- Create: `src/lib/local-agent/browser-session.ts`
- Create: `app/api/local-agent/relay-token/route.ts`
- Test: `tests/local-agent-relay.test.ts`
- Test: `local-agent/src-tauri/tests/envelope_crypto.rs`

**Interfaces:**
- Produces: relay protocol `v1`, agent/browser short-lived tokens, `EncryptedFrame`, heartbeat every 20 seconds.
- Consumes: paired Agent public key and authenticated owner session.

- [ ] **Step 1: Write failing crypto and cross-owner relay tests**

```rust
#[test]
fn envelope_round_trip_binds_sequence_and_session() {
    let frame = encrypt_frame(&session_keys(), "session-a", 1, b"질문").unwrap();
    assert_eq!(decrypt_frame(&session_keys(), "session-a", &frame).unwrap(), b"질문");
    assert!(decrypt_frame(&session_keys(), "session-b", &frame).is_err());
    assert!(replay_guard().accept(&frame).is_ok());
    assert!(replay_guard().accept(&frame).is_err());
}
```

```ts
test("relay never routes an owner A frame to owner B", async () => {
  const relay = await startTestRelay();
  const a = await relay.connectAgent(agentToken(ownerA));
  const b = await relay.connectBrowser(browserToken(ownerB, a.agentId));
  assert.equal(b.closeCode, 4403);
  assert.equal(relay.persistedPayloadCount(), 0);
});
```

- [ ] **Step 2: Run RED**

Run: `cargo test --manifest-path local-agent/src-tauri/Cargo.toml && npm.cmd test`

Expected: FAIL because the envelope and relay services do not exist.

- [ ] **Step 3: Define the only relay frame shape**

```ts
export type EncryptedFrame = {
  version: 1;
  ownerIdHash: string;
  agentId: string;
  sessionId: string;
  sequence: number;
  idempotencyKey: string;
  iv: string;
  ciphertext: string;
};
```

The relay validates routing metadata, sizes, connection identity, monotonic sequence, and 1 MiB frame limit. It does not log or parse `iv`/`ciphertext` and has no payload table.

- [ ] **Step 4: Implement WSS authentication and heartbeat**

```ts
wss.on("connection", (socket, request, identity) => {
  registry.attach(identity, socket);
  socket.on("message", (bytes) => registry.route(identity, parseBoundedFrame(bytes)));
  socket.on("pong", () => registry.touch(identity));
  socket.on("close", () => registry.detach(identity));
});
setInterval(() => registry.pingAndTerminateStale(40_000), 20_000).unref();
```

- [ ] **Step 5: Run GREEN verification**

Run: `cargo test --manifest-path local-agent/src-tauri/Cargo.toml && npm.cmd test && npm.cmd run typecheck`

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add -- services/local-agent-relay local-agent/src-tauri/src/crypto local-agent/src-tauri/tests/envelope_crypto.rs local-agent/src/services/relay-client.ts src/lib/local-agent/browser-session.ts app/api/local-agent/relay-token/route.ts tests/local-agent-relay.test.ts
git commit -m "feat: add end to end encrypted local agent relay"
```

---

### Task 9: Diagnose and supervise allowlisted local services

**Files:**
- Create: `local-agent/src-tauri/src/services/mod.rs`
- Create: `local-agent/src-tauri/src/services/health.rs`
- Create: `local-agent/src-tauri/src/services/supervisor.rs`
- Create: `local-agent/src/services/health-store.ts`
- Modify: `local-agent/src/App.tsx`
- Test: `local-agent/src-tauri/tests/service_health.rs`
- Test: `tests/local-agent-health-ui.test.ts`

**Interfaces:**
- Produces: `ServiceHealth` for llama.cpp, SearXNG, Trafilatura, Crawl4AI, Playwright, Docling, Valkey, and research worker.
- Consumes: fixed local endpoints and allowlisted executable paths from Agent settings.

- [ ] **Step 1: Write failing classification tests**

```rust
#[tokio::test]
async fn llama_health_distinguishes_connection_model_and_completion_failures() {
    assert_eq!(probe_llama(refused_server()).await.code, "LOCAL_LLM_CONNECTION_REFUSED");
    assert_eq!(probe_llama(server_with_no_model()).await.code, "LOCAL_LLM_MODEL_NOT_FOUND");
    assert_eq!(probe_llama(healthy_server()).await.status, HealthStatus::Healthy);
}

#[test]
fn arbitrary_shell_arguments_are_rejected() {
    assert!(ServiceCommand::parse("powershell -Command whoami").is_err());
}
```

- [ ] **Step 2: Run RED**

Run: `cargo test --manifest-path local-agent/src-tauri/Cargo.toml`

Expected: FAIL because service health and allowlisted command types do not exist.

- [ ] **Step 3: Implement exact service probes and solutions**

```rust
pub struct ServiceHealth {
    pub id: ServiceId,
    pub status: HealthStatus,
    pub code: String,
    pub reason: String,
    pub solution: Vec<String>,
    pub latency_ms: Option<u64>,
    pub checked_at: String,
}
```

llama.cpp probes TCP, `/v1/models`, then a bounded one-token completion. Other services probe version/health endpoints. Never call a non-loopback URL unless it exactly matches the user-approved private service origin.

- [ ] **Step 4: Run GREEN verification**

Run: `cargo test --manifest-path local-agent/src-tauri/Cargo.toml && npm.cmd --prefix local-agent run typecheck && npm.cmd test`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```powershell
git add -- local-agent/src-tauri/src/services local-agent/src-tauri/tests/service_health.rs local-agent/src/services/health-store.ts local-agent/src/App.tsx tests/local-agent-health-ui.test.ts
git commit -m "feat: diagnose local AI and research services"
```

---

### Task 10: Migrate existing approved server memory to the PC safely

**Files:**
- Create: `src/lib/local-agent/memory-migration.service.ts`
- Create: `app/api/local-agent/memory-migration/preview/route.ts`
- Create: `app/api/local-agent/memory-migration/export/route.ts`
- Create: `app/api/local-agent/memory-migration/confirm/route.ts`
- Create: `local-agent/src/services/memory-migration.ts`
- Modify: `components/Settings/LocalAgentSettingsCard.tsx`
- Test: `tests/local-agent-memory-migration.test.ts`
- Test: `local-agent/src/embedding/memory-migration.test.ts`

**Interfaces:**
- Produces: preview/export/checksum/confirm protocol and optional post-confirm server purge.
- Consumes: approved memories only, encrypted Relay, Vault atomic writer, search index.

- [ ] **Step 1: Write failing state and checksum tests**

```ts
test("server memory is not purged before local checksum confirmation", async () => {
  const migration = await beginMemoryMigration(ownerId);
  await exportApprovedMemory(ownerId, migration.id);
  assert.equal((await readMemoryDb(ownerId)).memories.length, 2);
  await assert.rejects(() => confirmMemoryMigration(ownerId, migration.id, { count: 2, manifestHash: "wrong" }));
  assert.equal((await readMemoryDb(ownerId)).memories.length, 2);
});

test("pending rejected forgotten and deleted memories are never exported", async () => {
  const preview = await previewMemoryMigration(ownerId);
  assert.equal(preview.approvedCount, 2);
  assert.equal(preview.excludedCount, 4);
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test && npm.cmd --prefix local-agent test`

Expected: FAIL because migration APIs and Agent import do not exist.

- [ ] **Step 3: Implement two-phase export and confirmation**

```ts
const manifest = approved.map((memory) => ({
  id: memory.id,
  checksum: sha256(canonicalApprovedMemory(memory)),
  payload: canonicalApprovedMemory(memory)
}));
return encryptForPairedAgent({ migrationId, items: manifest, manifestHash: sha256(stableJson(manifest)) });
```

Agent writes every Markdown file and index entry in a local transaction, then returns count and manifest hash. Server purge requires a second explicit `deleteServerCopies: true` confirmation.

- [ ] **Step 4: Run GREEN verification**

Run: `npm.cmd test && npm.cmd run typecheck && npm.cmd --prefix local-agent test && cargo test --manifest-path local-agent/src-tauri/Cargo.toml`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```powershell
git add -- src/lib/local-agent/memory-migration.service.ts app/api/local-agent/memory-migration local-agent/src/services/memory-migration.ts components/Settings/LocalAgentSettingsCard.tsx tests/local-agent-memory-migration.test.ts local-agent/src/embedding/memory-migration.test.ts
git commit -m "feat: migrate approved memory to local agent storage"
```

---

### Task 11: Package, license, and verify the Local Agent release

**Files:**
- Create: `local-agent/README.md`
- Create: `local-agent/THIRD_PARTY_NOTICES.md`
- Create: `local-agent/scripts/verify-release.mjs`
- Create: `.github/workflows/local-agent.yml`
- Modify: `README.md`
- Modify: `.env.example`
- Test: `tests/local-agent-release-contract.test.ts`

**Interfaces:**
- Consumes: Tasks 1–10.
- Produces: Windows installer evidence, macOS/Linux CI build contracts, SBOM/license notices, exact configuration guide.

- [ ] **Step 1: Write failing release contract test**

```ts
test("Local Agent release documents storage privacy and pinned licenses", () => {
  const readme = fs.readFileSync("local-agent/README.md", "utf8");
  const notices = fs.readFileSync("local-agent/THIRD_PARTY_NOTICES.md", "utf8");
  assert.match(readme, /%LOCALAPPDATA%\\DREAMWISH\\LocalAgent/u);
  assert.match(readme, /원문.*PostgreSQL.*저장하지/u);
  assert.match(notices, /SQLCipher.*BSD/u);
  assert.match(notices, /sqlite-vec.*(?:MIT|Apache)/u);
  assert.match(notices, /Transformers\.js.*Apache-2\.0/u);
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test`

Expected: FAIL because release documentation and workflow do not exist.

- [ ] **Step 3: Add CI and release verification**

CI matrix builds Windows x64, macOS arm64/x64, and Linux x64; runs Rust tests, Agent TypeScript tests, SQLCipher reopen, FTS5, vector capability/fallback, and artifact checksum generation. Windows runs `npm.cmd --prefix local-agent run build` and retains the `.msi`/`.exe` artifact.

- [ ] **Step 4: Run the local release gate**

Run: `npm.cmd test && npm.cmd run typecheck && npm.cmd run lint && npm.cmd --prefix local-agent run typecheck && npm.cmd --prefix local-agent test && cargo test --manifest-path local-agent/src-tauri/Cargo.toml && npm.cmd --prefix local-agent run build`

Expected: all commands exit 0 and Tauri produces a Windows installer in `local-agent/src-tauri/target/release/bundle`.

- [ ] **Step 5: Commit**

```powershell
git add -- local-agent/README.md local-agent/THIRD_PARTY_NOTICES.md local-agent/scripts/verify-release.mjs .github/workflows/local-agent.yml README.md .env.example tests/local-agent-release-contract.test.ts
git commit -m "build: package and verify DREAMWISH local agent"
```

## Completion Gate

- The signed Tauri Agent installs and runs as a tray application without opening a public listener.
- Keys are Stronghold-protected, indexes/checkpoints are SQLCipher-encrypted, and Markdown remains standard UTF-8 under the OS user profile.
- FTS5/vector hybrid search, pinned offline embeddings, and explicit FTS-only degradation pass their tests.
- Browser and Agent exchange only replay-safe end-to-end encrypted payloads through the opaque Railway relay.
- Approved server memory migration is owner-confirmed, checksummed, idempotent, and does not delete server copies without a second confirmation.
- Windows packaging and the cross-platform CI contract produce checksummed artifacts and third-party notices.
- Root tests, Agent tests, Rust tests, typecheck, lint, and the Windows release build pass.
