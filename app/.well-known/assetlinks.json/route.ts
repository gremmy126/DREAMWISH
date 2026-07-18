import { NextResponse } from "next/server";
import { buildAndroidAssetLinks } from "@/src/lib/devices/app-link-config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(buildAndroidAssetLinks(), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300"
    }
  });
}
