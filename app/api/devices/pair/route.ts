import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: {
        code: "DEVICE_PAIRING_PROTOCOL_UPGRADE_REQUIRED",
        message: "This companion version must be upgraded before pairing."
      }
    },
    { status: 410 }
  );
}
