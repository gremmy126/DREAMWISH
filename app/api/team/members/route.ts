import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  addTeamMember,
  listTeamMembers,
  removeTeamMember,
  updateTeamMember,
  type TeamRole
} from "@/src/lib/team/team.repository";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const members = await listTeamMembers(owner.uid);
  return NextResponse.json({ members });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    name?: string;
    role?: TeamRole;
  };
  try {
    const member = await addTeamMember(owner.uid, {
      email: String(body.email || ""),
      name: body.name,
      role: body.role
    });
    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "구성원을 추가하지 못했습니다." },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as {
    memberId?: string;
    name?: string;
    role?: TeamRole;
  };
  if (!body.memberId) {
    return NextResponse.json({ error: "구성원을 찾을 수 없습니다." }, { status: 404 });
  }
  const member = await updateTeamMember(owner.uid, body.memberId, {
    name: body.name,
    role: body.role
  });
  if (!member) {
    return NextResponse.json({ error: "구성원을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ member });
}

export async function DELETE(request: Request) {
  const owner = await requireOwnerContext(request);
  const url = new URL(request.url);
  const memberId = url.searchParams.get("memberId") || "";
  const removed = await removeTeamMember(owner.uid, memberId);
  if (!removed) {
    return NextResponse.json({ error: "구성원을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
