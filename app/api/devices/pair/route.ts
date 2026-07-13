import { NextResponse } from "next/server";
import { pairDevice } from "@/src/lib/devices/device.repository";
import type { DevicePlatform } from "@/src/lib/devices/device.types";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    challengeId?: string;
    code?: string;
    platform?: DevicePlatform;
    name?: string;
  };
  if (!body.challengeId || !body.code || (body.platform !== "android" && body.platform !== "ios")) {
    return NextResponse.json({ error: "페어링 정보가 올바르지 않습니다." }, { status: 400 });
  }
  try {
    const paired = await pairDevice({
      challengeId: body.challengeId,
      code: body.code,
      platform: body.platform,
      name: String(body.name || "")
    });
    return NextResponse.json(paired, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: safePairingError(error) }, { status: 400 });
  }
}

function safePairingError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "pairing_challenge_expired") return "페어링 코드가 만료되었습니다.";
  if (code === "pairing_challenge_used") return "이미 사용된 페어링 코드입니다.";
  return "페어링 코드가 올바르지 않습니다.";
}
