import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  getFileRecord,
  moveFileToFolder,
  removeFileRecord,
  toPublicFileRecord
} from "@/src/lib/files/file.repository";
import { deleteOwnerFile } from "@/src/lib/files/file-storage";

export async function PATCH(request: Request, context: { params: Promise<{ fileId: string }> }) {
  const owner = await requireOwnerContext(request);
  const { fileId } = await context.params;
  const body = await request.json().catch(() => ({})) as { folderId?: string | null };
  const folderId = typeof body.folderId === "string" && body.folderId.trim() ? body.folderId.trim() : null;
  try {
    const file = await moveFileToFolder(owner.uid, fileId, folderId);
    return NextResponse.json({ file: toPublicFileRecord(file) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: code === "FOLDER_NOT_FOUND" ? "폴더를 찾을 수 없습니다." : "파일을 찾을 수 없습니다." }, { status: 404 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ fileId: string }> }
) {
  const owner = await requireOwnerContext(request);
  const { fileId } = await context.params;
  const file = await getFileRecord(owner.uid, fileId);
  if (!file) {
    return NextResponse.json(
      { error: "파일을 찾을 수 없습니다." },
      { status: 404 }
    );
  }
  try {
    if (file.storageKey) {
      await deleteOwnerFile(owner.uid, file.storageKey);
    }
    await removeFileRecord(owner.uid, file.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        code: code === "STORAGE_BACKEND_UNAVAILABLE" ? code : undefined,
        error: "파일을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요."
      },
      { status: code === "STORAGE_BACKEND_UNAVAILABLE" ? 503 : 500 }
    );
  }
}
