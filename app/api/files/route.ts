import { NextResponse } from "next/server";
import { listFileRecords, saveFileRecord } from "@/src/lib/files/file.repository";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.has("projectId")
    ? url.searchParams.get("projectId")
    : undefined;
  return NextResponse.json({ files: await listFileRecords(projectId) });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    mimeType?: string;
    size?: number;
    source?: "aichat" | "files" | "knowledge";
    textPreview?: string;
    projectId?: string | null;
  };
  const file = await saveFileRecord({
    name: body.name || "",
    mimeType: body.mimeType || "application/octet-stream",
    size: typeof body.size === "number" ? body.size : 0,
    source: body.source || "files",
    textPreview: body.textPreview || "",
    projectId: body.projectId || null
  });
  return NextResponse.json({ file }, { status: 201 });
}
