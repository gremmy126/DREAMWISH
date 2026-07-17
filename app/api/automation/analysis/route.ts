import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { buildAutomationAnalysis } from "@/src/lib/automation/automation-analysis";
import { getVerifiedConnectionStates } from "@/src/lib/integrations/verified-connection.service";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const connectedApps = new Set<string>();
  try {
    for (const connection of await getVerifiedConnectionStates(owner.uid)) {
      if (connection.status === "connected") connectedApps.add(connection.connectorId);
    }
  } catch {
    // Connection lookup failure only reduces analysis detail.
  }
  const analysis = await buildAutomationAnalysis(owner.uid, { connectedApps });
  return NextResponse.json(
    { analysis },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
