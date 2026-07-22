import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  createDesignArtifact,
  listDesignArtifacts
} from "@/src/lib/design/design-artifacts.repository";
import { inspectGeneratedHtml } from "@/src/lib/design/html-guard";
import { mcpErrorResponse } from "@/src/lib/mcp/mcp-http";

const createSchema = z.object({
  type: z.enum(["website", "app", "program", "image"]),
  title: z.string().min(1).max(160),
  code: z.string().min(1).max(400_000),
  source: z.enum(["internal-engine", "mcp"]).default("internal-engine"),
  sourceServerId: z.string().max(80).nullable().optional(),
  skillId: z.string().max(80).nullable().optional(),
  metadata: z.record(z.string(), z.string()).optional()
});

export async function GET(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const artifacts = await listDesignArtifacts(owner.uid);
    // 목록은 코드 본문 없이 가볍게 내려준다.
    return NextResponse.json({
      ok: true,
      artifacts: artifacts.map(({ code, versions, ...rest }) => ({
        ...rest,
        codeBytes: code.length,
        versionCount: versions.length
      }))
    });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "저장할 결과물을 확인해 주세요." }, { status: 400 });
    }

    // HTML 계열은 저장 전에 보안 검사를 통과해야 한다 (DESIGN.md §11).
    let guard = null;
    if (parsed.data.type === "website" || parsed.data.type === "app") {
      guard = inspectGeneratedHtml(parsed.data.code);
      if (!guard.safe) {
        return NextResponse.json(
          {
            ok: false,
            error: "보안 검사에서 위험 항목이 발견되어 저장이 차단되었습니다.",
            findings: guard.findings
          },
          { status: 422 }
        );
      }
    }

    const artifact = await createDesignArtifact(owner.uid, parsed.data);
    return NextResponse.json(
      { ok: true, artifact, findings: guard?.findings ?? [] },
      { status: 201 }
    );
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
