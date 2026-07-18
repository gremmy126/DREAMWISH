import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { buildAutomationAnalysis } from "@/src/lib/automation/automation-analysis";
import { getActionGuide } from "@/src/lib/automation/registry/action-guide";
import { getVerifiedConnectionStates } from "@/src/lib/integrations/verified-connection.service";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const url = new URL(request.url);
  const appId = url.searchParams.get("appId")?.trim();
  const actionId = url.searchParams.get("actionId")?.trim();
  if (appId || actionId) {
    if (!appId || !actionId) {
      return NextResponse.json(
        { error: "appId와 actionId를 함께 입력하세요." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } }
      );
    }
    const guide = getActionGuide(appId, actionId, undefined, url.origin);
    if (!guide) {
      return NextResponse.json(
        { error: "Action 가이드를 찾을 수 없습니다." },
        { status: 404, headers: { "Cache-Control": "private, no-store" } }
      );
    }
    const connectionState = (await getVerifiedConnectionStates(owner.uid, request.url))
      .find((state) => state.connectorId === appId) || null;
    return NextResponse.json(
      { guide, connectionState },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }
  const analysis = await buildAutomationAnalysis(owner.uid);
  return NextResponse.json(
    { analysis },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
