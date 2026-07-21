import {
  readJsonStore,
  withJsonStoreLock,
  writeJsonStore
} from "../local-db/json-store";
import {
  listLatestOwnerDocuments,
  mutateOwnerDocument,
  readOwnerDocument
} from "./owner-document-store";
import { hasPostgresStorage } from "./postgres";

// Per-owner state documents that work in both storage modes:
// - PostgreSQL: one durable_owner_documents namespace per store
// - File mode: one JSON file per store holding a map of ownerId -> state
//
// mutateOwnerState runs the mutation inside a single transaction
// (pg advisory-locked sql.begin, or the file store mutex): if the mutation
// throws, nothing is persisted.

type OwnerStateMap<T> = Record<string, T>;

export type OwnerStateStore<T> = {
  namespace: string;
  fileName: string;
  fallback: () => T;
};

export async function readOwnerState<T>(
  store: OwnerStateStore<T>,
  ownerId: string
): Promise<T> {
  if (hasPostgresStorage()) {
    return readOwnerDocument<T>(ownerId, store.namespace, store.fallback());
  }
  const map = await readJsonStore<OwnerStateMap<T>>(store.fileName, {});
  return map[ownerId] ?? store.fallback();
}

export async function mutateOwnerState<T, R>(
  store: OwnerStateStore<T>,
  ownerId: string,
  mutate: (state: T) => R | Promise<R>
): Promise<R> {
  if (hasPostgresStorage()) {
    return mutateOwnerDocument<T, R>(
      ownerId,
      store.namespace,
      store.fallback(),
      mutate
    );
  }
  return withJsonStoreLock(store.fileName, async () => {
    const map = await readJsonStore<OwnerStateMap<T>>(store.fileName, {});
    const state = structuredClone(map[ownerId] ?? store.fallback());
    const result = await mutate(state);
    map[ownerId] = state;
    await writeJsonStore(store.fileName, map);
    return result;
  });
}

export async function listOwnerStates<T>(
  store: OwnerStateStore<T>
): Promise<Array<{ ownerId: string; state: T }>> {
  if (hasPostgresStorage()) {
    const documents = await listLatestOwnerDocuments<T>(store.namespace);
    return documents.map((document) => ({
      ownerId: document.ownerId,
      state: document.payload
    }));
  }
  const map = await readJsonStore<OwnerStateMap<T>>(store.fileName, {});
  return Object.entries(map).map(([ownerId, state]) => ({ ownerId, state }));
}
