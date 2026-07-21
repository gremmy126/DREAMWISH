import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { chatWithAI } from "@/src/lib/ai/ai.service";
import { createMemoryOsItem } from "@/src/lib/memory-os/memory-os.service";
import { summarizeMeetingNotes } from "@/src/lib/team/team-intelligence";
import {
  createMeeting,
  listMeetings,
  updateMeeting
} from "@/src/lib/team/team.repository";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const meetings = await listMeetings(owner.uid);
  return NextResponse.json({ meetings });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown> & {
    action?: "summarize";
    meetingId?: string;
  };

  try {
    // AI 회의 요약: 요약·액션 아이템·결론 생성 + Memory 저장 후보 등록.
    if (body.action === "summarize" && typeof body.meetingId === "string") {
      const meetings = await listMeetings(owner.uid);
      const meeting = meetings.find((candidate) => candidate.id === body.meetingId);
      if (!meeting) {
        return NextResponse.json({ error: "회의를 찾을 수 없습니다." }, { status: 404 });
      }
      let summary = summarizeMeetingNotes(meeting.notes);
      try {
        const response = await chatWithAI([
          {
            role: "system",
            content:
              '회의 노트를 요약한다. 반드시 JSON만 출력: {"summary":string(3문장 이하),' +
              '"actionItems":string[],"conclusion":string(한 문장)} — 노트에 없는 사실 생성 금지.'
          },
          { role: "user", content: meeting.notes.slice(0, 6000) }
        ]);
        const start = response.search(/\{/u);
        if (start >= 0) {
          const parsed = JSON.parse(response.slice(start).replace(/```/gu, "")) as Partial<
            typeof summary
          >;
          if (parsed.summary) {
            summary = {
              summary: String(parsed.summary).slice(0, 1000),
              actionItems: Array.isArray(parsed.actionItems)
                ? parsed.actionItems.map((item) => String(item).slice(0, 200)).slice(0, 10)
                : summary.actionItems,
              conclusion: String(parsed.conclusion || summary.conclusion).slice(0, 300)
            };
          }
        }
      } catch {
        // 결정론 요약으로 계속.
      }
      const updated = await updateMeeting(owner.uid, meeting.id, {
        summary: summary.summary,
        actionItems: summary.actionItems,
        conclusion: summary.conclusion
      });
      // 회의 결론을 Memory 저장 후보로 연결 (승인 후 확정).
      await createMemoryOsItem(owner.uid, {
        title: `회의: ${meeting.title}`,
        content: `${summary.summary}\n\n결론: ${summary.conclusion}\n액션: ${summary.actionItems.join("; ")}`,
        type: "meeting",
        status: "suggestion",
        project: meeting.title,
        tags: ["회의"]
      }).catch(() => undefined);
      return NextResponse.json({ meeting: updated });
    }

    const meeting = await createMeeting(owner.uid, {
      title: String(body.title || ""),
      decisionId: typeof body.decisionId === "string" ? body.decisionId : null,
      notes: typeof body.notes === "string" ? body.notes : "",
      date: typeof body.date === "string" ? body.date : undefined
    });
    return NextResponse.json({ meeting }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "회의를 처리하지 못했습니다." },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown> & {
    meetingId?: string;
  };
  if (!body.meetingId) {
    return NextResponse.json({ error: "회의를 찾을 수 없습니다." }, { status: 404 });
  }
  const meeting = await updateMeeting(owner.uid, String(body.meetingId), body as never);
  if (!meeting) {
    return NextResponse.json({ error: "회의를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ meeting });
}
