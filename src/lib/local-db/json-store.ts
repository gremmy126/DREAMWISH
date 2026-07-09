import fs from "node:fs/promises";
import path from "node:path";

const DB_DIR = path.join(process.cwd(), ".local-db");

export async function readJsonStore<T>(fileName: string, fallback: T): Promise<T> {
  await fs.mkdir(DB_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(path.join(DB_DIR, fileName), "utf8");
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return fallback;
  }
}

export async function writeJsonStore<T>(fileName: string, data: T) {
  await fs.mkdir(DB_DIR, { recursive: true });
  const filePath = path.join(DB_DIR, fileName);
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}
