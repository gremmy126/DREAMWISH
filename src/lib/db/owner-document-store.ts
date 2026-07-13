import { getPostgres } from "./postgres";

const CREATE_OWNER_DOCUMENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS durable_owner_documents (
    owner_id TEXT NOT NULL,
    namespace TEXT NOT NULL,
    revision BIGINT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (owner_id, namespace, revision)
  )
`;

let schemaReady: Promise<void> | null = null;

export type OwnerDocument<T> = {
  ownerId: string;
  namespace: string;
  revision: number;
  payload: T;
  createdAt: string;
};

export async function readOwnerDocument<T>(
  ownerId: string,
  namespace: string,
  fallback: T
): Promise<T> {
  assertKey(ownerId, "ownerId");
  assertKey(namespace, "namespace");
  await ensureOwnerDocumentSchema();
  const sql = getPostgres();
  const rows = await sql`
    SELECT payload
    FROM durable_owner_documents
    WHERE owner_id = ${ownerId} AND namespace = ${namespace}
    ORDER BY revision DESC
    LIMIT 1
  `;
  return cloneValue((rows[0]?.payload as T | undefined) ?? fallback);
}

export async function listLatestOwnerDocuments<T>(namespace: string) {
  assertKey(namespace, "namespace");
  await ensureOwnerDocumentSchema();
  const sql = getPostgres();
  const rows = await sql`
    SELECT DISTINCT ON (owner_id)
      owner_id,
      namespace,
      revision,
      payload,
      created_at
    FROM durable_owner_documents
    WHERE namespace = ${namespace}
    ORDER BY owner_id, revision DESC
  `;
  return rows.map((row) => ({
    ownerId: String(row.owner_id),
    namespace: String(row.namespace),
    revision: Number(row.revision),
    payload: cloneValue(row.payload as T),
    createdAt: new Date(row.created_at as string | Date).toISOString()
  })) satisfies Array<OwnerDocument<T>>;
}

export async function mutateOwnerDocument<T, R>(
  ownerId: string,
  namespace: string,
  fallback: T,
  mutate: (document: T) => R | Promise<R>
): Promise<R> {
  assertKey(ownerId, "ownerId");
  assertKey(namespace, "namespace");
  await ensureOwnerDocumentSchema();
  const sql = getPostgres();

  return (await sql.begin(async (transaction) => {
    const lockKey = `${ownerId}:${namespace}`;
    await transaction`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const rows = await transaction`
      SELECT revision, payload
      FROM durable_owner_documents
      WHERE owner_id = ${ownerId} AND namespace = ${namespace}
      ORDER BY revision DESC
      LIMIT 1
      FOR UPDATE
    `;
    const revision = Number(rows[0]?.revision || 0) + 1;
    const document = cloneValue((rows[0]?.payload as T | undefined) ?? fallback);
    const result = await mutate(document);
    await transaction`
      INSERT INTO durable_owner_documents (
        owner_id,
        namespace,
        revision,
        payload
      ) VALUES (
        ${ownerId},
        ${namespace},
        ${revision},
        ${transaction.json(document as never)}
      )
    `;
    return result;
  })) as R;
}

async function ensureOwnerDocumentSchema() {
  schemaReady ??= getPostgres()
    .unsafe(CREATE_OWNER_DOCUMENTS_TABLE)
    .then(() => undefined)
    .catch((error) => {
      schemaReady = null;
      throw error;
    });
  await schemaReady;
}

function assertKey(value: string, name: string) {
  if (!value.trim() || value.length > 180) {
    throw new Error(`${name} must be a non-empty string up to 180 characters.`);
  }
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}
