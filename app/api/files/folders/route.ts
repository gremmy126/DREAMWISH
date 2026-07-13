import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { createFolder, listFolders } from "@/src/lib/files/file.repository";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const folders = await listFolders(owner.uid);
  return NextResponse.json({ folders: folders.map(({ ownerId: _ownerId, ...folder }) => folder) });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = await request.json().catch(() => ({})) as { name?: string };
  try {
    const { ownerId: _ownerId, ...folder } = await createFolder(owner.uid, body.name || "");
    return NextResponse.json({ folder }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: code === "FOLDER_EXISTS" ? "같은 이름의 폴더가 이미 있습니다." : "폴더 이름을 입력하세요." }, { status: 400 });
  }
}
