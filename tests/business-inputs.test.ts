import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBusinessCard, listBusinessCards } from "../src/lib/business/business-card.repository";
import { createMeeting, listMeetings } from "../src/lib/business/meeting.repository";

test("business card and meeting records remain owner scoped", async () => {
  await withTempDataDir(async () => {
    await createBusinessCard({ ownerId: "owner-a", imageName: "card.png", imagePath: "owner-a/card.png", mimeType: "image/png", size: 123, name: "김민수", email: "minsu@example.com", phone: "010-1234-5678", companyName: "퓨처엔", position: "팀장" });
    await createMeeting({ ownerId: "owner-a", title: "고객 회의", startsAt: "2026-07-14T01:00:00.000Z", endsAt: "2026-07-14T02:00:00.000Z", attendees: ["김민수"], notes: "도입 논의", decisions: "PoC 진행", followUps: ["견적 발송"] });
    assert.equal((await listBusinessCards("owner-a")).length, 1);
    assert.equal((await listMeetings("owner-a")).length, 1);
    assert.deepEqual(await listBusinessCards("owner-b"), []);
    assert.deepEqual(await listMeetings("owner-b"), []);
  });
});

test("Business exposes reviewed business-card and meeting inputs", async () => {
  const hub = await read("components/Business/BusinessHub.tsx");
  const cards = await read("components/Business/BusinessCardImport.tsx");
  const meetings = await read("components/Business/MeetingManager.tsx");
  const cardRoute = await read("app/api/business/cards/route.ts");
  const meetingRoute = await read("app/api/business/meetings/route.ts");
  assert.match(hub, /BusinessCardImport/u);
  assert.match(hub, /MeetingManager/u);
  assert.match(cards, /명함 추가/u);
  assert.match(cards, /accept="image\/png,image\/jpeg,image\/webp"/u);
  assert.match(cards, /고객으로 승인 등록/u);
  assert.match(meetings, /회의 추가/u);
  assert.match(meetings, /캘린더에도 일정 추가/u);
  assert.match(cardRoute, /requireOwnerContext\(request\)/u);
  assert.match(meetingRoute, /requireOwnerContext\(request\)/u);
});

async function withTempDataDir(run: () => Promise<void>) {
  const previous = process.env.DATA_DIR;
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dreamwish-business-inputs-"));
  process.env.DATA_DIR = dataDir;
  try { await run(); } finally {
    if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous;
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

function read(relativePath: string) { return fs.readFile(path.join(process.cwd(), relativePath), "utf8"); }
