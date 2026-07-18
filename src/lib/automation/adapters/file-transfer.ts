import { randomUUID } from "node:crypto";
import { getFileRecord, saveFileRecord } from "../../files/file.repository";
import { readOwnerFile, storeOwnerFile } from "../../files/file-storage";
import type { ActionValue } from "../registry/action.types";

export type ActionFile = { bytes: Buffer; name: string; contentType: string };

export async function loadActionFile(
  ownerId: string,
  value: ActionValue | undefined,
  fallbackName: string
): Promise<ActionFile> {
  if (typeof value === "string") {
    const record = await getFileRecord(ownerId, value);
    if (record?.storageKey) {
      const bytes = await readOwnerFile(ownerId, record.storageKey);
      return assertFileSize({ bytes, name: record.name, contentType: record.mimeType });
    }
    const dataUrl = parseDataUrl(value, fallbackName);
    if (dataUrl) return assertFileSize(dataUrl);
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const source = value as Record<string, ActionValue>;
    const encoded = typeof source.base64 === "string"
      ? source.base64
      : typeof source.data === "string" ? source.data : "";
    if (encoded) {
      const parsed = parseDataUrl(encoded, fallbackName);
      return assertFileSize(parsed || {
        bytes: Buffer.from(encoded, "base64"),
        name: typeof source.name === "string" ? source.name : fallbackName,
        contentType: typeof source.contentType === "string" ? source.contentType : "application/octet-stream"
      });
    }
  }
  throw Object.assign(new Error("파일 입력은 저장된 DREAMWISH 파일 ID 또는 data URL이어야 합니다."), {
    code: "ACTION_INPUT_INVALID",
    retryable: false
  });
}

export async function saveRemoteFile(input: {
  ownerId: string;
  bytes: Buffer;
  name: string;
  contentType: string;
  folderId?: string | null;
}) {
  const id = randomUUID();
  const stored = await storeOwnerFile({
    ownerId: input.ownerId,
    fileId: id,
    bytes: input.bytes,
    contentType: input.contentType
  });
  return saveFileRecord({
    ownerId: input.ownerId,
    id,
    name: input.name,
    mimeType: input.contentType,
    size: input.bytes.byteLength,
    source: "files",
    projectId: null,
    folderId: input.folderId || null,
    storageKey: stored.storageKey,
    sha256: stored.sha256
  });
}

export function filenameFromDisposition(value: string | null, fallback: string) {
  const encoded = value?.match(/filename\*=UTF-8''([^;]+)/iu)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded); } catch { return fallback; }
  }
  return value?.match(/filename="?([^";]+)"?/iu)?.[1]?.trim() || fallback;
}

function parseDataUrl(value: string, fallbackName: string): ActionFile | null {
  const match = value.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/u);
  if (!match) return null;
  return {
    bytes: match[2] ? Buffer.from(match[3] || "", "base64") : Buffer.from(decodeURIComponent(match[3] || ""), "utf8"),
    name: fallbackName,
    contentType: match[1] || "application/octet-stream"
  };
}

function assertFileSize(file: ActionFile) {
  if (file.bytes.byteLength > 50 * 1024 * 1024) {
    throw Object.assign(new Error("자동화 파일은 50 MiB 이하여야 합니다."), {
      code: "ACTION_INPUT_TOO_LARGE",
      retryable: false
    });
  }
  return file;
}
