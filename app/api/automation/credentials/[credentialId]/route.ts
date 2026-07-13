import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { deleteCredential } from "@/src/lib/automation/credential.repository";

export async function DELETE(request: Request, context: { params: Promise<{ credentialId: string }> }) {
  const owner = await requireOwnerContext(request);
  const { credentialId } = await context.params;
  const deleted = await deleteCredential(owner.uid, credentialId);
  return NextResponse.json({ deleted }, { status: deleted ? 200 : 404 });
}
