"use client";

import { RefreshCcw, Search, ShieldCheck, UserRoundCog } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "user";
  status: "active" | "suspended" | "deletion_pending" | "deleted";
  lastLoginAt: string;
  deletionScheduledAt: string | null;
};

const ACTIONS = [
  ["force_logout", "세션 해제", "REVOKE"],
  ["suspend", "정지", "SUSPEND"],
  ["restore", "복원", ""],
  ["promote", "관리자 지정", "ADMIN"],
  ["demote", "관리자 해제", "REVOKE"],
  ["schedule_delete", "7일 후 삭제", "DELETE"],
  ["cancel_delete", "삭제 취소", ""]
] as const;

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/users?query=${encodeURIComponent(query)}`, { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as { users?: AdminUser[]; error?: string };
    if (!response.ok) throw new Error(body.error || "사용자 목록을 불러오지 못했습니다.");
    setUsers(body.users || []);
  }, [query]);
  useEffect(() => { void load().catch((caught) => setError(caught.message)); }, [load]);

  async function runAction(user: AdminUser, action: string, phrase: string) {
    const confirmationPhrase = phrase ? window.prompt(`${user.email} 계정에 작업을 적용하려면 ${phrase}를 입력하세요.`) : "";
    if (phrase && confirmationPhrase !== phrase) return;
    if (!phrase && !window.confirm(`${user.email} 계정에 이 작업을 적용할까요?`)) return;
    setBusy(`${user.id}:${action}`);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, confirmationPhrase })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "관리자 작업에 실패했습니다.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "관리자 작업에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-[22px] border border-app-border bg-white p-4 shadow-soft sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-lg font-bold">사용자 관리</h2><p className="mt-1 text-xs text-app-muted">계정 상태, 역할, 로그인과 삭제 예약을 제어합니다.</p></div>
        <div className="flex gap-2">
          <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-app-border px-3 sm:w-72"><Search size={15} className="text-app-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이메일 또는 이름 검색" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></label>
          <button type="button" aria-label="새로고침" onClick={() => void load()} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-app-border"><RefreshCcw size={16} /></button>
        </div>
      </div>
      {error ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-xs text-red-700">{error}</p> : null}
      <div className="app-scrollbar mt-5 overflow-x-auto">
        <table className="min-w-[980px] w-full text-left text-xs">
          <thead className="bg-slate-50 text-app-muted"><tr>{["사용자", "역할", "상태", "최근 로그인", "삭제 예정", "작업"].map((label) => <th key={label} className="px-3 py-3 font-bold">{label}</th>)}</tr></thead>
          <tbody>{users.map((user) => <tr key={user.id} className="border-t border-app-border align-top"><td className="px-3 py-4"><div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-app-hover text-app-primary"><UserRoundCog size={16} /></span><div><p className="font-bold">{user.name || "이름 없음"}</p><p className="mt-1 text-[10px] text-app-muted">{user.email}</p></div></div></td><td className="px-3 py-4"><span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-700">{user.role === "admin" ? <ShieldCheck size={11} /> : null}{user.role}</span></td><td className="px-3 py-4 font-semibold">{user.status}</td><td className="px-3 py-4 whitespace-nowrap">{new Date(user.lastLoginAt).toLocaleString("ko-KR")}</td><td className="px-3 py-4 whitespace-nowrap">{user.deletionScheduledAt ? new Date(user.deletionScheduledAt).toLocaleString("ko-KR") : "—"}</td><td className="px-3 py-3"><div className="flex max-w-[380px] flex-wrap gap-1.5">{ACTIONS.map(([action, label, phrase]) => <button key={action} type="button" disabled={busy !== null} onClick={() => void runAction(user, action, phrase)} className="min-h-9 rounded-xl border border-app-border px-2.5 text-[10px] font-bold transition hover:bg-app-hover disabled:opacity-40">{label}</button>)}</div></td></tr>)}</tbody>
        </table>
        {users.length === 0 && !error ? <p className="py-14 text-center text-sm text-app-muted">표시할 사용자가 없습니다.</p> : null}
      </div>
    </section>
  );
}

