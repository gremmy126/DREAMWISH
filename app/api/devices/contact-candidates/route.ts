import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { createCustomerDraft } from "@/src/lib/crm/crm.repository";
import { listContactCandidates, markContactCandidates } from "@/src/lib/devices/device.repository";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const url = new URL(request.url);
  return NextResponse.json({ candidates: await listContactCandidates(owner.uid, url.searchParams.get("deviceId") || undefined) });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as { candidateIds?: string[] };
  const ids = Array.isArray(body.candidateIds) ? [...new Set(body.candidateIds.filter((id) => typeof id === "string"))].slice(0, 200) : [];
  const selected = (await listContactCandidates(owner.uid)).filter((item) => ids.includes(item.id) && item.status === "pending");
  const customers = [];
  for (const candidate of selected) {
    customers.push(await createCustomerDraft({
      ownerId: owner.uid,
      name: candidate.name,
      email: candidate.email,
      phone: candidate.phone,
      companyName: candidate.companyName,
      position: candidate.position,
      memo: `휴대폰 연락처에서 가져옴 · 기기 ${candidate.deviceId}`
    }));
  }
  await markContactCandidates(owner.uid, selected.map((item) => item.id), "imported");
  return NextResponse.json({ customers, importedCount: customers.length });
}
