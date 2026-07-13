import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getFileRecord } from "@/src/lib/files/file.repository";
import { readOwnerFile } from "@/src/lib/files/file-storage";

export async function GET(request: Request, context: { params: Promise<{ fileId: string }> }) {
  const owner = await requireOwnerContext(request);
  const { fileId } = await context.params;
  const file = await getFileRecord(owner.uid, fileId);
  if (!file) return Response.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  if (!file.storageKey) return Response.json({ error: "이전 기록에는 다운로드 가능한 원본 파일이 없습니다." }, { status: 410 });
  try {
    const bytes = await readOwnerFile(owner.uid, file.storageKey);
    const fallback = file.name.replace(/[^a-zA-Z0-9._-]/gu, "_") || "download";
    const encoded = encodeURIComponent(file.name).replace(/['()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "원본 파일을 찾을 수 없습니다." }, { status: 410 });
  }
}
