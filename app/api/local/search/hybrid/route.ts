import { NextResponse } from "next/server";
import { hybridSearchResults } from "@/src/lib/search/search.service";

export async function POST(request: Request) {
  const body = await request.json();
  const query = String(body.query || "");
  const limit = Number(body.limit || 12);
  const results = await hybridSearchResults(query, limit);
  return NextResponse.json({ results });
}
