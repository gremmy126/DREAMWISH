import fs from "node:fs/promises";
import path from "node:path";
import { withStoreMutex } from "./store-mutex";

export function getDataDirectory() {
  return process.env.DATA_DIR?.trim() || path.join(process.cwd(), ".local-db");
}

export function withJsonStoreLock<T>(fileName: string, operation: () => Promise<T>) {
  return withStoreMutex(path.join(getDataDirectory(), fileName), operation);
}

export function withJsonStorePathLock<T>(filePath: string, operation: () => Promise<T>) {
  return withStoreMutex(filePath, operation);
}

export async function readJsonStore<T>(fileName: string, fallback: T): Promise<T> {
  const dbDir = getDataDirectory();
  await fs.mkdir(dbDir, { recursive: true });
  try {
    const raw = await fs.readFile(path.join(dbDir, fileName), "utf8");
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return fallback;
  }
}

export async function writeJsonStore<T>(fileName: string, data: T) {
  const dbDir = getDataDirectory();
  await fs.mkdir(dbDir, { recursive: true });
  const filePath = path.join(dbDir, fileName);
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}
