import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { approveBusinessCard, listBusinessCards } from "@/src/lib/business/business-card.repository";
import { createCustomerDraft } from "@/src/lib/crm/crm.repository";

type Context = { params: Promise<{ cardId: string }> };

export async function POST(request: Request, context: Context) {
  const owner = await requireOwnerContext(request);
  const { cardId } = await context.params;
  const card = (await listBusinessCards(owner.uid)).find((item) => item.id === cardId);
  if (!card) return NextResponse.json({ error: "명함을 찾지 못했습니다." }, { status: 404 });
  if (card.status === "approved") return NextResponse.json({ error: "이미 CRM에 등록된 명함입니다." }, { status: 409 });
  if (!card.name.trim()) return NextResponse.json({ error: "고객 이름을 확인해주세요." }, { status: 400 });
  const customer = await createCustomerDraft({ ownerId: owner.uid, name: card.name, email: card.email, phone: card.phone, companyName: card.companyName, position: card.position, memo: `명함 이미지 ${card.imageName}에서 승인 등록` });
  await approveBusinessCard(owner.uid, card.id, customer.id);
  return NextResponse.json({ customer });
}
