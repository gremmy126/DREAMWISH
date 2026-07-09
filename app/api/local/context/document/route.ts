import { NextResponse } from "next/server";
import { suggestConnectionsForDocument } from "@/src/lib/connections/connections.service";
import { loadMarkdownDocuments } from "@/src/lib/rag/document-loader";

export async function POST(request: Request) {
  const body = await request.json();
  const documentId = String(body.documentId || body.path || "");
  const documents = await loadMarkdownDocuments();
  const document = documents.find((item) => item.relativePath === documentId);

  if (!document) {
    return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({
    document: {
      title: document.title,
      path: document.relativePath,
      updatedAt: document.updated,
      preview: document.content.slice(0, 1200)
    },
    suggestions: await suggestConnectionsForDocument(documentId)
  });
}
