import { NextResponse } from "next/server";
import {
  suggestConnectionsForChat,
  suggestConnectionsForDocument,
  suggestConnectionsForQuery
} from "@/src/lib/connections/connections.service";

export async function POST(request: Request) {
  const body = await request.json();

  if (body.documentId) {
    return NextResponse.json({
      suggestions: await suggestConnectionsForDocument(String(body.documentId))
    });
  }

  if (body.sessionId) {
    return NextResponse.json({
      suggestions: await suggestConnectionsForChat(String(body.sessionId))
    });
  }

  return NextResponse.json({
    suggestions: await suggestConnectionsForQuery(String(body.query || ""))
  });
}
