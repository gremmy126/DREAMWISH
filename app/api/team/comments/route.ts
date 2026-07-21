import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  addComment,
  listComments,
  resolveComment
} from "@/src/lib/team/team.repository";

// Decision Chat — 결정 단위 협업 코멘트. 익명 설문과 달리 실명 협업 공간이다.
export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const url = new URL(request.url);
  const decisionId = url.searchParams.get("decisionId") || "";
  if (!decisionId) return NextResponse.json({ comments: [] });
  const comments = await listComments(owner.uid, decisionId);
  return NextResponse.json({ comments });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as {
    decisionId?: string;
    text?: string;
    parentId?: string;
  };
  if (!body.decisionId) {
    return NextResponse.json({ error: "결정을 찾을 수 없습니다." }, { status: 404 });
  }
  try {
    const comment = await addComment(owner.uid, {
      decisionId: body.decisionId,
      author: owner.email.split("@")[0],
      text: String(body.text || ""),
      parentId: body.parentId || null
    });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "댓글을 저장하지 못했습니다." },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as {
    commentId?: string;
    resolved?: boolean;
  };
  if (!body.commentId) {
    return NextResponse.json({ error: "댓글을 찾을 수 없습니다." }, { status: 404 });
  }
  const comment = await resolveComment(owner.uid, body.commentId, body.resolved !== false);
  if (!comment) {
    return NextResponse.json({ error: "댓글을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ comment });
}
