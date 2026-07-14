import { removeFileRecord } from "./file.repository";
import {
  createOwnerStorageKey,
  deleteOwnerFile,
  storeOwnerFile
} from "./file-storage";

type StoreInput = Parameters<typeof storeOwnerFile>[0];
type StoredOwnerFile = Awaited<ReturnType<typeof storeOwnerFile>>;
type UploadDependencies = {
  storeOwnerFile: typeof storeOwnerFile;
  deleteOwnerFile: typeof deleteOwnerFile;
  removeFileRecord: typeof removeFileRecord;
};

const DEFAULT_DEPENDENCIES: UploadDependencies = {
  storeOwnerFile,
  deleteOwnerFile,
  removeFileRecord
};

export async function withStoredOwnerFile<T>(
  input: StoreInput,
  persist: (stored: StoredOwnerFile) => Promise<T>,
  dependencies: UploadDependencies = DEFAULT_DEPENDENCIES
) {
  const expectedStorageKey = createOwnerStorageKey(input.ownerId, input.fileId);
  try {
    const stored = await dependencies.storeOwnerFile(input);
    return await persist(stored);
  } catch (error) {
    await dependencies
      .deleteOwnerFile(input.ownerId, expectedStorageKey)
      .catch(() => undefined);
    await dependencies
      .removeFileRecord(input.ownerId, input.fileId)
      .catch(() => undefined);
    throw error;
  }
}
