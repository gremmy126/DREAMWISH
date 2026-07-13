import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { createPairingChallenge } from "@/src/lib/devices/device.repository";
import type { DevicePlatform } from "@/src/lib/devices/device.types";

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as { platform?: DevicePlatform };
  if (body.platform !== "android" && body.platform !== "ios") {
    return NextResponse.json({ error: "Android 또는 iPhone을 선택해주세요." }, { status: 400 });
  }
  return NextResponse.json({ challenge: await createPairingChallenge(owner.uid, body.platform) }, { status: 201 });
}
