import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { loadDesignMd } from "@/src/lib/design/design-md";
import { DESIGN_TOKENS } from "@/src/lib/design/design-tokens";
import { mcpErrorResponse } from "@/src/lib/mcp/mcp-http";

// The DreamWish design contract: parsed DESIGN.md plus the token table.
export async function GET(request: Request) {
  try {
    await requireOwnerContext(request);
    const document = loadDesignMd();
    return NextResponse.json({
      ok: true,
      designSystem: {
        title: document.title,
        sections: document.sections,
        raw: document.raw,
        tokens: DESIGN_TOKENS
      }
    });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
