import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { isBlockedFileName, listFileRecords, saveFileRecord, toPublicFileRecord } from "@/src/lib/files/file.repository";
import { withStoredOwnerFile } from "@/src/lib/files/file-upload-transaction";
import { withAccountStorageCapacity } from "@/src/lib/storage/account-storage-quota";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const url = new URL(request.url);
  const projectId = url.searchParams.has("projectId") ? url.searchParams.get("projectId") : undefined;
  const files = await listFileRecords(owner.uid, projectId);
  return NextResponse.json({ files: files.map(toPublicFileRecord) });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  let form: FormData;
  try { form = await request.formData(); } catch {
    return NextResponse.json({ error: "multipart/form-data 파일 업로드가 필요합니다." }, { status: 415 });
  }
  const upload = form.get("file");
  if (!(upload instanceof File)) return NextResponse.json({ error: "업로드할 파일을 선택하세요." }, { status: 400 });
  if (upload.size > MAX_FILE_SIZE) return NextResponse.json({ error: "파일은 최대 25MB까지 업로드할 수 있습니다." }, { status: 413 });
  if (isBlockedFileName(upload.name)) return NextResponse.json({ error: "실행 가능한 파일 형식은 업로드할 수 없습니다." }, { status: 415 });

  const sourceValue = String(form.get("source") || "files");
  const source = sourceValue === "aichat" || sourceValue === "knowledge" ? sourceValue : "files";
  const projectId = String(form.get("projectId") || "").trim() || null;
  const folderId = String(form.get("folderId") || "").trim() || null;
  const textPreview = String(form.get("textPreview") || "").slice(0, 12000);
  const fileId = randomUUID();
  const bytes = Buffer.from(await upload.arrayBuffer());
  try {
    const record = await withAccountStorageCapacity(owner.uid, upload.size, async () => {
      return withStoredOwnerFile(
        {
          ownerId: owner.uid,
          fileId,
          bytes,
          contentType: upload.type || "application/octet-stream"
        },
        (stored) =>
          saveFileRecord({
            ownerId: owner.uid,
            id: fileId,
            name: upload.name,
            mimeType: upload.type || "application/octet-stream",
            size: upload.size,
            source,
            textPreview,
            projectId,
            folderId,
            storageKey: stored.storageKey,
            sha256: stored.sha256,
          })
      );
    });
    return NextResponse.json({ file: toPublicFileRecord(record) }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "STORAGE_QUOTA_EXCEEDED") {
      return NextResponse.json(
        {
          code,
          error: "계정 저장공간 10GB 한도를 초과했습니다. 파일을 정리한 뒤 다시 시도해주세요."
        },
        { status: 413 }
      );
    }
    if (code === "STORAGE_BACKEND_UNAVAILABLE") {
      return NextResponse.json(
        { code, error: "파일 저장소를 사용할 수 없습니다. 잠시 후 다시 시도해주세요." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        error:
          code === "FOLDER_NOT_FOUND"
            ? "선택한 폴더를 찾을 수 없습니다."
            : "파일을 저장하지 못했습니다."
      },
      { status: code === "FOLDER_NOT_FOUND" ? 404 : 500 }
    );
  }
}
