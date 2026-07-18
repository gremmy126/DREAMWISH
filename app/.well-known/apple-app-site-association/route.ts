import { NextResponse } from "next/server";
import { buildAppleAppSiteAssociation } from "@/src/lib/devices/app-link-config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(buildAppleAppSiteAssociation(), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300"
    }
  });
}
