import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { listOwnerDevices } from "@/src/lib/devices/device.repository";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  return NextResponse.json({ devices: await listOwnerDevices(owner.uid) });
}
