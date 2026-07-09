import { NextResponse } from "next/server";
import { listExternalIdentityMatches } from "@/src/lib/repositories/external-identity-match.repository";

export async function GET() {
  return NextResponse.json({ matches: await listExternalIdentityMatches() });
}
