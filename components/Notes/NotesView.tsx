"use client";

import {
  FileText,
  Folder,
  NotebookTabs,
  Plus,
  Save,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/Common/EmptyState";
import { SectionHeader } from "@/components/Common/SectionHeader";
import { SurfaceCard } from "@/components/Common/SurfaceCard";

type LocalNote = {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
};

type LocalFolder = {
  id: string;
  name: string;
  notes: LocalNote[];
};

const STORAGE_KEY = "local-first-ai-notes-v1";

export function NotesView() {
  const [folders, setFolders] = useState<LocalFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | undefined>();
  const [activeNoteId, setActiveNoteId] = useState<string | undefined>();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalFolder[];
      setFolders(Array.isArray(parsed) ? parsed : []);
      setActiveFolderId(parsed?.[0]?.id);
      setActiveNoteId(parsed?.[0]?.notes?.[0]?.id);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(folders));
  }, [folders, hydrated]);

  const activeFolder = useMemo(
    () => folders.find((folder) => folder.id === activeFolderId),
    [folders, activeFolderId]
  );
  const activeNote = useMemo(
    () => activeFolder?.notes.find((note) => note.id === activeNoteId),
    [activeFolder, activeNoteId]
  );

  function createFolder() {
    const folder: LocalFolder = {
      id: crypto.randomUUID(),
      name: "새 폴더",
      notes: []
    };
    setFolders((prev) => [...prev, folder]);
    setActiveFolderId(folder.id);
    setActiveNoteId(undefined);
  }

  function createNote() {
    if (!activeFolderId) return;

    const note: LocalNote = {
      id: crypto.randomUUID(),
      title: "제목 없음",
      content: "",
      updatedAt: new Date().toISOString()
    };

    setFolders((prev) =>
      prev.map((folder) =>
        folder.id === activeFolderId
          ? { ...folder, notes: [note, ...folder.notes] }
          : folder
      )
    );
    setActiveNoteId(note.id);
  }

  function updateFolderName(folderId: string, name: string) {
    setFolders((prev) =>
      prev.map((folder) =>
        folder.id === folderId ? { ...folder, name } : folder
      )
    );
  }

  function updateActiveNote(update: Partial<Pick<LocalNote, "title" | "content">>) {
    if (!activeFolderId || !activeNoteId) return;

    setFolders((prev) =>
      prev.map((folder) =>
        folder.id === activeFolderId
          ? {
              ...folder,
              notes: folder.notes.map((note) =>
                note.id === activeNoteId
                  ? { ...note, ...update, updatedAt: new Date().toISOString() }
                  : note
              )
            }
          : folder
      )
    );
  }

  function deleteActiveNote() {
    if (!activeFolderId || !activeNoteId) return;

    setFolders((prev) =>
      prev.map((folder) =>
        folder.id === activeFolderId
          ? {
              ...folder,
              notes: folder.notes.filter((note) => note.id !== activeNoteId)
            }
          : folder
      )
    );
    setActiveNoteId(undefined);
  }

  function deleteActiveFolder() {
    if (!activeFolderId) return;

    setFolders((prev) => prev.filter((folder) => folder.id !== activeFolderId));
    setActiveFolderId(undefined);
    setActiveNoteId(undefined);
  }

  return (
    <SurfaceCard className="h-[calc(100vh-96px)] min-h-[720px] overflow-hidden">
      <div className="border-b border-app-border p-5">
        <SectionHeader
          icon={NotebookTabs}
          title="노트"
          description="폴더별로 문서를 만들고 바로 작성합니다."
          action={
            <button
              type="button"
              onClick={createFolder}
              className="flex h-10 items-center gap-2 rounded-2xl bg-app-primary px-4 text-sm font-medium text-white shadow-soft transition hover:brightness-105"
            >
              <Plus size={16} />
              폴더
            </button>
          }
        />
      </div>

      <div className="grid h-[calc(100%-96px)] grid-cols-[260px_320px_minmax(0,1fr)]">
        <div className="min-h-0 border-r border-app-border bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Folder size={16} className="text-app-primary" />
              <p className="text-sm font-semibold text-app-text">폴더</p>
            </div>
            {activeFolderId ? (
              <button
                type="button"
                onClick={deleteActiveFolder}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-app-hover hover:text-app-primary"
                aria-label="폴더 삭제"
              >
                <Trash2 size={14} />
              </button>
            ) : null}
          </div>

          <div className="min-h-0 space-y-2 overflow-auto app-scrollbar">
            {folders.length === 0 ? (
              <EmptyState
                compact
                icon={Folder}
                title="폴더 없음"
                description="새 폴더를 만들어 노트를 정리하세요."
              />
            ) : (
              folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => {
                    setActiveFolderId(folder.id);
                    setActiveNoteId(folder.notes[0]?.id);
                  }}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                    folder.id === activeFolderId
                      ? "border-app-primary bg-app-hover"
                      : "border-app-border bg-white hover:bg-app-hover"
                  }`}
                >
                  <input
                    value={folder.name}
                    onChange={(event) => updateFolderName(folder.id, event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    className="w-full bg-transparent text-sm font-semibold text-app-text outline-none"
                  />
                  <p className="mt-1 text-xs text-app-muted">
                    {folder.notes.length}개 노트
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="min-h-0 border-r border-app-border bg-app-bg p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-app-primary" />
              <p className="text-sm font-semibold text-app-text">문서</p>
            </div>
            <button
              type="button"
              onClick={createNote}
              disabled={!activeFolderId}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-app-border bg-white text-app-primary transition hover:bg-app-hover disabled:text-slate-300"
              aria-label="노트 추가"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="min-h-0 space-y-2 overflow-auto app-scrollbar">
            {!activeFolder ? (
              <EmptyState
                compact
                icon={NotebookTabs}
                title="폴더 선택"
                description="왼쪽에서 폴더를 선택하세요."
              />
            ) : activeFolder.notes.length === 0 ? (
              <EmptyState
                compact
                icon={NotebookTabs}
                title="노트 없음"
                description="이 폴더에 첫 노트를 추가하세요."
              />
            ) : (
              activeFolder.notes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => setActiveNoteId(note.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    note.id === activeNoteId
                      ? "border-app-primary bg-white shadow-soft"
                      : "border-app-border bg-white/70 hover:bg-white"
                  }`}
                >
                  <p className="truncate text-sm font-semibold text-app-text">
                    {note.title || "제목 없음"}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-app-muted">
                    {note.content || "내용 없음"}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="min-h-0 bg-white p-6">
          {!activeNote ? (
            <div className="h-full rounded-app border border-dashed border-app-border bg-app-bg">
              <EmptyState
                icon={NotebookTabs}
                title="문서를 선택하세요"
                description="폴더와 문서를 만들면 이곳에서 바로 작성할 수 있습니다."
              />
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2 text-xs text-app-muted">
                  <Save size={14} className="text-app-primary" />
                  <span>자동 저장</span>
                  <span>·</span>
                  <span>{new Date(activeNote.updatedAt).toLocaleString("ko-KR")}</span>
                </div>
                <button
                  type="button"
                  onClick={deleteActiveNote}
                  className="flex h-9 w-9 items-center justify-center rounded-2xl border border-app-border bg-white text-slate-400 transition hover:bg-app-hover hover:text-app-primary"
                  aria-label="노트 삭제"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <input
                value={activeNote.title}
                onChange={(event) => updateActiveNote({ title: event.target.value })}
                className="mb-4 w-full bg-transparent text-3xl font-semibold text-app-text outline-none placeholder:text-slate-300"
                placeholder="제목 없음"
              />
              <textarea
                value={activeNote.content}
                onChange={(event) => updateActiveNote({ content: event.target.value })}
                className="min-h-0 flex-1 resize-none rounded-app border border-app-border bg-app-bg p-5 text-sm leading-7 text-app-text outline-none transition focus:border-app-primary focus:bg-white"
                placeholder="글을 입력하세요..."
              />
            </div>
          )}
        </div>
      </div>
    </SurfaceCard>
  );
}
