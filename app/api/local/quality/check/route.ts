import { NextResponse } from "next/server";
import { checkDocumentQuality } from "@/src/lib/quality/document-quality.service";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return NextResponse.json(await checkDocumentQuality(String(body.query || "")));
}
