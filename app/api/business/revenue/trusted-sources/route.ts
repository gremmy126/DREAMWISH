import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { disableRevenueTrustRule, listRevenueTrustRules, setRevenueTrustRule } from "@/src/lib/business/revenue-policy";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

const bodySchema = z.object({ sourceApp: z.string().trim().min(3).max(200), acknowledged: z.literal(true) }).strict();

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  return NextResponse.json({ rules: await listRevenueTrustRules(owner.uid) });
}
export async function PUT(request: Request) {
  assertSameOriginMutation(request); const owner = await requireOwnerContext(request); const body = bodySchema.parse(await request.json());
  return NextResponse.json({ rule: await setRevenueTrustRule({ ownerId: owner.uid, ...body }) });
}
export async function DELETE(request: Request) {
  assertSameOriginMutation(request); const owner = await requireOwnerContext(request); const body = z.object({sourceApp: z.string().min(3).max(200)}).strict().parse(await request.json());
  return NextResponse.json({ rule: await disableRevenueTrustRule(owner.uid, body.sourceApp) });
}
