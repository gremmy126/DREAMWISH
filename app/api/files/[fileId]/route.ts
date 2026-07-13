import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { moveFileToFolder, toPublicFileRecord } from "@/src/lib/files/file.repository";

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
