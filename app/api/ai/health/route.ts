import { NextResponse } from "next/server";
import { getAIProviderHealth } from "@/src/lib/ai/config";

export async function GET() {
  return NextResponse.json({
    configuredProviders: getAIProviderHealth(),
    langGraphReady: true,
    retrievalReady: true
  });
}
