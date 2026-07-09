"use client";

import { CalendarDays, Clock3, Plus, Rows3 } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/Common/EmptyState";
import { SectionHeader } from "@/components/Common/SectionHeader";
import { SegmentedControl } from "@/components/Common/SegmentedControl";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import type { CalendarItem } from "@/src/lib/calendar/calendar.repository";

type CalendarMode = "Month" | "Week" | "Day";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthCells = Array.from({ length: 35 }, (_, index) => index + 1);

export function CalendarView() {
  const [mode, setMode] = useState<CalendarMode>("Month");
  const [events, setEvents] = useState<CalendarItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    startsAt: new Date().toISOString().slice(0, 16),
    endsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
    description: ""
  });

  useEffect(() => {
    void loadEvents();
  }, []);

  async function loadEvents() {
    const response = await fetch("/api/calendar/events");
    const data = (await response.json()) as { events?: CalendarItem[] };
    setEvents(data.events || []);
  }

  async function createEvent() {
    const response = await fetch("/api/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString()
      })
    });
    if (response.ok) {
      setModalOpen(false);
      await loadEvents();
    }
  }

  return (
    <SurfaceCard className="min-h-[720px] p-6">
      <SectionHeader
        icon={CalendarDays}
        title="캘린더"
        description="직접 만든 일정과 Google Calendar 동기화 일정이 표시됩니다."
        action={
          <div className="flex items-center gap-2">
            <SegmentedControl options={["Month", "Week", "Day"]} value={mode} onChange={setMode} />
            <button type="button" onClick={() => setModalOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-app-primary px-3 text-xs font-semibold text-white">
              <Plus size={14} />새 일정
            </button>
          </div>
        }
      />

      {mode === "Month" ? (
        <div className="overflow-hidden rounded-app border border-app-border bg-white">
          <div className="grid grid-cols-7 border-b border-app-border bg-app-bg">
            {weekdays.map((day) => <div key={day} className="px-4 py-3 text-xs font-semibold text-app-muted">{day}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {monthCells.map((day) => (
              <div key={day} className="min-h-[108px] border-b border-r border-app-border p-3 last:border-r-0">
                <span className="text-xs font-medium text-slate-400">{day}</span>
                <div className="mt-2 space-y-1">
                  {eventsForDay(events, day).map((event) => (
                    <div key={event.id} className="truncate rounded-xl bg-app-hover px-2 py-1 text-[11px] font-semibold text-app-primary">
                      {event.title}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid min-h-[560px] grid-cols-[90px_minmax(0,1fr)] overflow-hidden rounded-app border border-app-border bg-white">
          <div className="border-r border-app-border bg-app-bg p-4"><Rows3 size={18} className="text-app-primary" /></div>
          <div className="p-6">
            {events.length === 0 ? <EmptyState icon={Clock3} title={`${mode} 보기`} description="아직 일정이 없습니다." /> : events.map((event) => <div key={event.id} className="mb-3 rounded-app border border-app-border bg-app-bg p-4"><p className="font-semibold text-app-text">{event.title}</p><p className="mt-1 text-xs text-app-muted">{new Date(event.startsAt).toLocaleString("ko-KR")}</p></div>)}
          </div>
        </div>
      )}

      {modalOpen ? (
        <Modal title="새 일정" onClose={() => setModalOpen(false)}>
          <Input label="제목" value={form.title} onChange={(title) => setForm((prev) => ({ ...prev, title }))} />
          <Input label="시작" type="datetime-local" value={form.startsAt} onChange={(startsAt) => setForm((prev) => ({ ...prev, startsAt }))} />
          <Input label="종료" type="datetime-local" value={form.endsAt} onChange={(endsAt) => setForm((prev) => ({ ...prev, endsAt }))} />
          <textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} className="mb-3 min-h-24 w-full rounded-app border border-app-border bg-app-bg px-4 py-3 text-sm outline-none focus:border-app-primary" placeholder="설명" />
          <button type="button" onClick={() => void createEvent()} className="h-11 w-full rounded-app bg-app-primary text-sm font-semibold text-white">저장</button>
        </Modal>
      ) : null}
    </SurfaceCard>
  );
}

function eventsForDay(events: CalendarItem[], day: number) {
  return events.filter((event) => new Date(event.startsAt).getDate() === day).slice(0, 3);
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4"><div className="w-[420px] rounded-app border border-app-border bg-white p-5 shadow-app"><div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold text-app-text">{title}</h2><button type="button" onClick={onClose} className="rounded-2xl border border-app-border px-3 py-1 text-xs font-semibold text-app-muted">닫기</button></div>{children}</div></div>;
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="mb-3 block"><span className="text-xs font-semibold text-app-muted">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-app border border-app-border bg-app-bg px-4 py-3 text-sm outline-none focus:border-app-primary" /></label>;
}
