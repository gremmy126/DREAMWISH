import { NextResponse } from "next/server";
import { searchWeb } from "@/src/lib/web-search/web-search.service";

export async function POST(request: Request) {
  const body = await request.json();
  const query = String(body.query || "").trim();

  if (!query) {
    return NextResponse.json({ error: "검색어를 입력해주세요." }, { status: 400 });
  }

  try {
    const results = await searchWeb(query);
    return NextResponse.json({ query, provider: "web", results });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "웹 검색 결과를 가져오지 못했습니다."
      },
      { status: 502 }
    );
  }
}
