import { NextResponse } from "next/server";
import { getPublicAIProviderCatalog } from "@/src/lib/ai/config";

export async function GET() {
  return NextResponse.json({ providers: getPublicAIProviderCatalog() });
}
