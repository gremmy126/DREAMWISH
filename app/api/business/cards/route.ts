import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { createBusinessCard, listBusinessCards } from "@/src/lib/business/business-card.repository";
import { getDataDirectory } from "@/src/lib/local-db/json-store";

const ALLOWED_TYPES = new Map([["image/png", ".png"], ["image/jpeg", ".jpg"], ["image/webp", ".webp"]]);

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const cards = await listBusinessCards(owner.uid);
  return NextResponse.json({ cards: cards.map(({ imagePath: _imagePath, ...card }) => card) });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const form = await request.formData().catch(() => null);
  const image = form?.get("image");
  if (!(image instanceof File) || !ALLOWED_TYPES.has(image.type) || image.size <= 0 || image.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "PNG, JPG 또는 WebP 명함 이미지를 10MB 이하로 선택해주세요." }, { status: 400 });
  }
  const relativeDir = path.join("business-cards", owner.uid.replace(/[^a-zA-Z0-9_-]/gu, "_"));
  const relativePath = path.join(relativeDir, `${randomUUID()}${ALLOWED_TYPES.get(image.type)}`);
  const absolutePath = path.join(getDataDirectory(), relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, Buffer.from(await image.arrayBuffer()));
  const card = await createBusinessCard({
    ownerId: owner.uid, imageName: image.name.slice(0, 200), imagePath: relativePath,
    mimeType: image.type, size: image.size,
    name: clean(form?.get("name"), 120), email: clean(form?.get("email"), 254),
    phone: clean(form?.get("phone"), 60), companyName: clean(form?.get("companyName"), 160),
    position: clean(form?.get("position"), 120)
  });
  const { imagePath: _imagePath, ...safeCard } = card;
  return NextResponse.json({ card: safeCard }, { status: 201 });
}

function clean(value: FormDataEntryValue | null | undefined, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
