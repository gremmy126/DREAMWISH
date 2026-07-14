import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getDataDirectory } from "../local-db/json-store";
import type { FileStorageBackend } from "./file-storage.types";

export function createLocalFileStorage(): FileStorageBackend {
  return {
    async put(key, bytes) {
      const destination = resolveLocalKey(key);
      const directory = path.dirname(destination);
      const temporary = path.join(
        directory,
        `.${path.basename(destination)}.${randomBytes(8).toString("hex")}.tmp`
      );
      await fs.mkdir(directory, { recursive: true });
      try {
        await fs.writeFile(temporary, bytes, { flag: "wx" });
        await fs.rename(temporary, destination);
      } catch (error) {
        await fs.rm(temporary, { force: true }).catch(() => undefined);
        throw error;
      }
    },
    async get(key) {
      try {
        return await fs.readFile(resolveLocalKey(key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new Error("FILE_NOT_FOUND");
        }
        throw error;
      }
    },
    async delete(key) {
      await fs.rm(resolveLocalKey(key), { force: true });
    }
  };
}

function resolveLocalKey(key: string) {
  const parts = key.split("/");
  if (
    parts.length === 2 &&
    /^[a-f0-9]{32}$/u.test(parts[0] || "") &&
    /^[a-zA-Z0-9-]{1,128}$/u.test(parts[1] || "")
  ) {
    return path.join(getDataDirectory(), "files", ...parts);
  }
  if (
    parts.length !== 4 ||
    parts[0] !== "owners" ||
    !/^[a-f0-9]{32}$/u.test(parts[1] || "") ||
    parts[2] !== "files" ||
    !/^[a-zA-Z0-9-]{1,128}$/u.test(parts[3] || "")
  ) {
    throw new Error("FILE_NOT_FOUND");
  }
  return path.join(getDataDirectory(), "files", ...parts);
}
