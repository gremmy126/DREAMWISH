import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  deleteDesignArtifact,
  getDesignArtifact,
  restoreDesignArtifactVersion,
  updateDesignArtifact
} from "@/src/lib/design/design-artifacts.repository";
import { inspectGeneratedHtml } from "@/src/lib/design/html-guard";
import { mcpErrorResponse } from "@/src/lib/mcp/mcp-http";

type RouteContext = { params: Promise<{ artifactId: string }> };

const patchSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  code: z.string().min(1).max(400_000).optional(),
  versionNote: z.string().max(200).optional(),
  status: z.enum(["draft", "ready", "review", "approved", "failed", "archived"]).optional(),
  /** restore a stored version instead of patching fields. */
  restoreVersionId: z.string().max(80).optional(),
  metadata: z.record(z.string(), z.string()).optional()
});

export async function GET(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const { artifactId } = await context.params;
    const artifact = await getDesignArtifact(owner.uid, artifactId);
    if (!artifact) {
      return NextResponse.json({ ok: false, error: "결과물을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, artifact });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const { artifactId } = await context.params;
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "수정 값을 확인해 주세요." }, { status: 400 });
    }

    if (parsed.data.restoreVersionId) {
      const artifact = await restoreDesignArtifactVersion(
        owner.uid,
        artifactId,
        parsed.data.restoreVersionId
      );
      return NextResponse.json({ ok: true, artifact });
    }

    if (parsed.data.code) {
      const existing = await getDesignArtifact(owner.uid, artifactId);
      if (existing && (existing.type === "website" || existing.type === "app")) {
        const guard = inspectGeneratedHtml(parsed.data.code);
        if (!guard.safe) {
          return NextResponse.json(
            {
              ok: false,
              error: "보안 검사에서 위험 항목이 발견되어 수정이 차단되었습니다.",
              findings: guard.findings
            },
            { status: 422 }
          );
        }
      }
    }

    const artifact = await updateDesignArtifact(owner.uid, artifactId, parsed.data);
    return NextResponse.json({ ok: true, artifact });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const { artifactId } = await context.params;
    await deleteDesignArtifact(owner.uid, artifactId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
