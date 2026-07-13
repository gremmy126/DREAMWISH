"use client";

import { CalendarDays, Check, Clock3, Loader2, Plus, Rows3, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/Common/EmptyState";
import { SectionHeader } from "@/components/Common/SectionHeader";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import { APP_TRANSLATIONS, type AppLanguage } from "@/src/lib/i18n/translations";
import type { CalendarItem } from "@/src/lib/calendar/calendar.repository";

type CalendarMode = "Month" | "Week" | "Day";

type MobileCalendarCandidate = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  sourceDevice: string;
};

const monthCells = Array.from({ length: 35 }, (_, index) => index + 1);

export function CalendarView() {
  const [mode, setMode] = useState<CalendarMode>("Month");
  const [events, setEvents] = useState<CalendarItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [phoneImportOpen, setPhoneImportOpen] = useState(false);
  const [phoneCandidates, setPhoneCandidates] = useState<MobileCalendarCandidate[]>([]);
  const [selectedPhoneIds, setSelectedPhoneIds] = useState<string[]>([]);
  const [phoneImportBusy, setPhoneImportBusy] = useState(false);
  const [phoneImportError, setPhoneImportError] = useState<string | null>(null);
  const { language, t } = useAppLanguage();
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

  async function openPhoneImport() {
    setPhoneImportOpen(true);
    setPhoneImportBusy(true);
    setPhoneImportError(null);
    try {
      const response = await fetch("/api/devices/calendar-candidates");
      const data = (await response.json().catch(() => null)) as
        | { candidates?: MobileCalendarCandidate[]; error?: string }
        | null;
      if (!response.ok) throw new Error(data?.error || "휴대폰 일정을 불러오지 못했습니다.");
      const candidates = data?.candidates || [];
      setPhoneCandidates(candidates);
      setSelectedPhoneIds(candidates.map((candidate) => candidate.id));
    } catch (caught) {
      setPhoneCandidates([]);
      setSelectedPhoneIds([]);
      setPhoneImportError(caught instanceof Error ? caught.message : "휴대폰 일정을 불러오지 못했습니다.");
    } finally {
      setPhoneImportBusy(false);
    }
  }

  async function importPhoneEvents() {
    if (selectedPhoneIds.length === 0) return;
    setPhoneImportBusy(true);
    setPhoneImportError(null);
    try {
      const response = await fetch("/api/devices/calendar-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds: selectedPhoneIds })
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "선택한 일정을 가져오지 못했습니다.");
      setPhoneImportOpen(false);
      await loadEvents();
    } catch (caught) {
      setPhoneImportError(caught instanceof Error ? caught.message : "선택한 일정을 가져오지 못했습니다.");
    } finally {
      setPhoneImportBusy(false);
    }
  }

  const modeOptions: Array<{ value: CalendarMode; label: string }> = [
    { value: "Month", label: t("calendar.month") },
    { value: "Week", label: t("calendar.week") },
    { value: "Day", label: t("calendar.day") }
  ];
  const activeModeLabel = modeOptions.find((option) => option.value === mode)?.label || mode;
  const weekdays = APP_TRANSLATIONS[language].calendar.weekdays;

  return (
    <SurfaceCard className="min-h-[720px] p-6">
      <SectionHeader
        icon={CalendarDays}
        title={t("calendar.title")}
        description={t("calendar.description")}
        action={
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-2xl border border-app-border bg-white p-1">
              {modeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMode(option.value)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                    mode === option.value
                      ? "bg-app-primary text-white shadow-soft"
                      : "text-app-muted hover:bg-app-hover hover:text-app-primary"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void openPhoneImport()} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-app-border bg-white px-3 text-xs font-semibold text-app-text hover:bg-app-hover hover:text-app-primary">
              <Smartphone size={14} />휴대폰에서 가져오기
            </button>
            <button type="button" onClick={() => setModalOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-app-primary px-3 text-xs font-semibold text-white">
              <Plus size={14} />{t("calendar.newEvent")}
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
            {events.length === 0 ? <EmptyState icon={Clock3} title={activeModeLabel} description={t("calendar.empty")} /> : events.map((event) => <div key={event.id} className="mb-3 rounded-app border border-app-border bg-app-bg p-4"><p className="font-semibold text-app-text">{event.title}</p><p className="mt-1 text-xs text-app-muted">{formatDateTime(event.startsAt, language)}</p></div>)}
          </div>
        </div>
      )}

      {modalOpen ? (
        <Modal title={t("calendar.newEvent")} closeLabel={t("common.close")} onClose={() => setModalOpen(false)}>
          <Input label={t("calendar.titleField")} value={form.title} onChange={(title) => setForm((prev) => ({ ...prev, title }))} />
          <Input label={t("calendar.startsAt")} type="datetime-local" value={form.startsAt} onChange={(startsAt) => setForm((prev) => ({ ...prev, startsAt }))} />
          <Input label={t("calendar.endsAt")} type="datetime-local" value={form.endsAt} onChange={(endsAt) => setForm((prev) => ({ ...prev, endsAt }))} />
          <textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} className="mb-3 min-h-24 w-full rounded-app border border-app-border bg-app-bg px-4 py-3 text-sm outline-none focus:border-app-primary" placeholder={t("calendar.descriptionField")} />
          <button type="button" onClick={() => void createEvent()} className="h-11 w-full rounded-app bg-app-primary text-sm font-semibold text-white">{t("common.save")}</button>
        </Modal>
      ) : null}

      {phoneImportOpen ? (
        <Modal title="가져올 일정 검토" closeLabel={t("common.close")} onClose={() => setPhoneImportOpen(false)}>
          <p className="mb-4 text-xs leading-5 text-app-muted">연결된 Android 또는 iPhone에서 전송한 일정만 표시됩니다. 선택한 항목은 확인 후 DREAMWISH 캘린더에 추가됩니다.</p>
          {phoneImportBusy && phoneCandidates.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-app-muted"><Loader2 size={16} className="animate-spin" />휴대폰 일정 확인 중</div>
          ) : null}
          {phoneImportError ? <p className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{phoneImportError}</p> : null}
          {!phoneImportBusy && phoneCandidates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-app-border px-4 py-8 text-center">
              <Smartphone size={24} className="mx-auto text-app-primary" />
              <p className="mt-3 text-sm font-semibold text-app-text">가져올 일정이 없습니다.</p>
              <p className="mt-1 text-xs text-app-muted">비즈니스의 휴대폰 연결에서 기기를 먼저 연결하고 일정을 전송해주세요.</p>
            </div>
          ) : null}
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {phoneCandidates.map((candidate) => {
              const checked = selectedPhoneIds.includes(candidate.id);
              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => setSelectedPhoneIds((current) => checked ? current.filter((id) => id !== candidate.id) : [...current, candidate.id])}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left ${checked ? "border-app-primary bg-app-hover" : "border-app-border bg-white"}`}
                >
                  <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-md border ${checked ? "border-app-primary bg-app-primary text-white" : "border-app-border"}`}>{checked ? <Check size={13} /> : null}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-app-text">{candidate.title}</span><span className="mt-1 block text-xs text-app-muted">{formatDateTime(candidate.startsAt, language)} · {candidate.sourceDevice}</span></span>
                </button>
              );
            })}
          </div>
          <button type="button" disabled={phoneImportBusy || selectedPhoneIds.length === 0} onClick={() => void importPhoneEvents()} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-app bg-app-primary text-sm font-semibold text-white disabled:opacity-40">
            {phoneImportBusy ? <Loader2 size={16} className="animate-spin" /> : <CalendarDays size={16} />}선택 항목 가져오기
          </button>
        </Modal>
      ) : null}
    </SurfaceCard>
  );
}

function eventsForDay(events: CalendarItem[], day: number) {
  return events.filter((event) => new Date(event.startsAt).getDate() === day).slice(0, 3);
}

function Modal({ title, closeLabel, children, onClose }: { title: string; closeLabel: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4"><div className="w-[420px] rounded-app border border-app-border bg-white p-5 shadow-app"><div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold text-app-text">{title}</h2><button type="button" onClick={onClose} className="rounded-2xl border border-app-border px-3 py-1 text-xs font-semibold text-app-muted">{closeLabel}</button></div>{children}</div></div>;
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="mb-3 block"><span className="text-xs font-semibold text-app-muted">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-app border border-app-border bg-app-bg px-4 py-3 text-sm outline-none focus:border-app-primary" /></label>;
}

function formatDateTime(value: string, language: AppLanguage) {
  const locale = language === "en" ? "en-US" : language === "ja" ? "ja-JP" : "ko-KR";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
