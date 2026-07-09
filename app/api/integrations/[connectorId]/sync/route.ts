import { NextResponse } from "next/server";
import { runManualIntegrationSync } from "@/src/lib/integrations/sync-engine";

type RouteContext = {
  params: Promise<{ connectorId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { connectorId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    days?: number;
    limit?: number;
  };
  const result = await runManualIntegrationSync(connectorId, {
    days: clampNumber(body.days, 1, 30, 30),
    limit: clampNumber(body.limit, 1, 50, 20)
  });
  return NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}
