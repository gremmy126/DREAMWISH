import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { loadDesignMd } from "@/src/lib/design/design-md";
import {
  getDesignSystemDocument,
  renderOverridesCss,
  restoreDesignSystemVersion,
  saveDesignSystemOverrides
} from "@/src/lib/design/design-system-overrides.repository";
import { DESIGN_TOKENS } from "@/src/lib/design/design-tokens";
import { mcpErrorResponse } from "@/src/lib/mcp/mcp-http";

// The DreamWish design contract: parsed DESIGN.md, the base token table, and
// the caller's saved overrides (editable color tokens + version history).
export async function GET(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const document = loadDesignMd();
    const saved = await getDesignSystemDocument(owner.uid);
    return NextResponse.json({
      ok: true,
      designSystem: {
        title: document.title,
        sections: document.sections,
        raw: document.raw,
        tokens: DESIGN_TOKENS,
        overrides: saved.overrides,
        overridesCss: renderOverridesCss(saved.overrides),
        versions: saved.versions.map((version) => ({
          versionId: version.versionId,
          note: version.note,
          createdAt: version.createdAt,
          tokenCount: Object.keys(version.overrides).length
        }))
      }
    });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

const patchSchema = z.union([
  z.object({
    overrides: z.record(
      z.string(),
      z.object({ light: z.string().max(10), dark: z.string().max(10) })
    ),
    note: z.string().max(120).optional()
  }),
  z.object({ restoreVersionId: z.string().min(1).max(80) }),
  z.object({ reset: z.literal(true) })
]);

export async function PATCH(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "수정 값을 확인해 주세요." }, { status: 400 });
    }

    const document =
      "restoreVersionId" in parsed.data
        ? await restoreDesignSystemVersion(owner.uid, parsed.data.restoreVersionId)
        : "reset" in parsed.data
          ? await saveDesignSystemOverrides(owner.uid, {}, "기본값으로 초기화")
          : await saveDesignSystemOverrides(owner.uid, parsed.data.overrides, parsed.data.note);

    return NextResponse.json({
      ok: true,
      overrides: document.overrides,
      overridesCss: renderOverridesCss(document.overrides),
      versions: document.versions.map((version) => ({
        versionId: version.versionId,
        note: version.note,
        createdAt: version.createdAt,
        tokenCount: Object.keys(version.overrides).length
      }))
    });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
