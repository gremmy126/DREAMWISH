import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { listDesignSkills } from "@/src/lib/design/design-skills";
import { mcpErrorResponse } from "@/src/lib/mcp/mcp-http";

export async function GET(request: Request) {
  try {
    await requireOwnerContext(request);
    // promptDirective은 서버 전용 — 클라이언트에는 메타데이터만 노출한다.
    const skills = listDesignSkills().map(({ promptDirective: _omit, ...skill }) => skill);
    return NextResponse.json({ ok: true, skills });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
