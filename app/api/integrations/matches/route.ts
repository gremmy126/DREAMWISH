import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { listExternalIdentityMatches } from "@/src/lib/repositories/external-identity-match.repository";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  return NextResponse.json({ matches: await listExternalIdentityMatches(owner.uid) });
}
