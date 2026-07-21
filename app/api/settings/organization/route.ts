import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  getOrganizationProfile,
  migrateBusinessPlanToMemory,
  updateOrganizationProfile
} from "@/src/lib/settings/organization-profile";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const state = await getOrganizationProfile(owner.uid);
  return NextResponse.json(state);
}

export async function PATCH(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const profile = await updateOrganizationProfile(owner.uid, body as never);
  return NextResponse.json({ profile });
}

// Imports retired Business-page plan data into Memory as pending candidates.
export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const result = await migrateBusinessPlanToMemory(owner.uid);
  return NextResponse.json(result);
}
