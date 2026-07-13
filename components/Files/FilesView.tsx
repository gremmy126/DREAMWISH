"use client";

import { Download, File, FileImage, FileSpreadsheet, FileText, Folder, FolderOpen, Image, Plus, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/Common/EmptyState";
import { SectionHeader } from "@/components/Common/SectionHeader";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import type { FileCategory, FileFolder, PublicFileRecord } from "@/src/lib/files/file.repository";

type PublicFolder = Omit<FileFolder, "ownerId">;
type CategoryFilter = "all" | FileCategory;

const categories: Array<{ id: CategoryFilter; label: string; icon: typeof File }> = [
  { id: "all", label: "전체", icon: File },
  { id: "pdf", label: "PDF", icon: FileText },
  { id: "word", label: "Word", icon: File },
  { id: "excel", label: "Excel", icon: FileSpreadsheet },
  { id: "image", label: "이미지", icon: FileImage },
  { id: "other", label: "기타", icon: FolderOpen },
];

export function FilesView() {
  const [files, setFiles] = useState<PublicFileRecord[]>([]);
  const [folders, setFolders] = useState<PublicFolder[]>([]);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [activeFolder, setActiveFolder] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { void loadWorkspace(); }, []);

  async function loadWorkspace() {
    const [fileResponse, folderResponse] = await Promise.all([fetch("/api/files"), fetch("/api/files/folders")]);
    const fileData = await fileResponse.json().catch(() => ({})) as { files?: PublicFileRecord[]; error?: string };
    const folderData = await folderResponse.json().catch(() => ({})) as { folders?: PublicFolder[]; error?: string };
    if (!fileResponse.ok || !folderResponse.ok) {
      setError(fileData.error || folderData.error || "파일 목록을 불러오지 못했습니다.");
      return;
    }
    setFiles(fileData.files || []);
    setFolders(folderData.folders || []);
  }

  async function saveFile(file: globalThis.File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("source", "files");
      form.set("textPreview", await readPreview(file));
      if (activeFolder !== "all" && activeFolder !== "root") form.set("folderId", activeFolder);
      const response = await fetch("/api/files", { method: "POST", body: form });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "파일을 업로드하지 못했습니다.");
      await loadWorkspace();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "파일을 업로드하지 못했습니다.");
    } finally { setBusy(false); }
  }

  async function createNewFolder() {
    const name = window.prompt("새 폴더 이름을 입력하세요.")?.trim();
    if (!name) return;
    const response = await fetch("/api/files/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await response.json().catch(() => ({})) as { folder?: PublicFolder; error?: string };
    if (!response.ok || !data.folder) { setError(data.error || "폴더를 만들지 못했습니다."); return; }
    await loadWorkspace();
    setActiveFolder(data.folder.id);
  }

  async function moveFile(fileId: string, folderId: string) {
    const response = await fetch(`/api/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: folderId || null }),
    });
    const data = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) { setError(data.error || "파일을 이동하지 못했습니다."); return; }
    await loadWorkspace();
  }

  const visibleFiles = useMemo(() => files.filter((file) => {
    const categoryMatches = activeCategory === "all" || file.category === activeCategory;
    const folderMatches = activeFolder === "all" || (activeFolder === "root" ? !file.folderId : file.folderId === activeFolder);
    return categoryMatches && folderMatches;
  }), [activeCategory, activeFolder, files]);

  return (
    <div className="space-y-5">
      <SurfaceCard className="p-6">
        <SectionHeader
          icon={Folder}
          title="파일"
          description="AI Chat 첨부와 직접 업로드한 원본 파일을 폴더와 형식별로 관리합니다."
          action={<div className="flex gap-2"><button type="button" onClick={() => void createNewFolder()} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-app-border bg-white px-3 text-xs font-semibold text-app-text"><FolderOpen size={14} />새 폴더</button><button type="button" disabled={busy} onClick={() => fileInputRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-app-primary px-3 text-xs font-semibold text-white disabled:opacity-50"><Plus size={14} />{busy ? "업로드 중" : "파일 추가"}</button></div>}
        />
        <input ref={fileInputRef} type="file" className="hidden" onChange={(event) => { const selected = event.target.files?.[0]; if (selected) void saveFile(selected); event.currentTarget.value = ""; }} />
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => { const Icon = category.icon; return <button type="button" key={category.id} onClick={() => setActiveCategory(category.id)} className={`flex h-10 items-center gap-2 rounded-2xl border px-4 text-sm font-medium transition ${activeCategory === category.id ? "border-app-primary bg-app-hover text-app-primary" : "border-app-border bg-white text-app-text hover:bg-app-hover"}`}><Icon size={15} />{category.label}</button>; })}
        </div>
        {error ? <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
      </SurfaceCard>

      <div className="grid min-h-[560px] gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
        <SurfaceCard className="p-4">
          <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold text-app-text">폴더</p><span className="text-[11px] text-app-muted">{folders.length}개</span></div>
          <div className="space-y-1">
            <FolderButton active={activeFolder === "all"} label="모든 파일" count={files.length} onClick={() => setActiveFolder("all")} />
            <FolderButton active={activeFolder === "root"} label="분류되지 않음" count={files.filter((file) => !file.folderId).length} onClick={() => setActiveFolder("root")} />
            {folders.map((folder) => <FolderButton key={folder.id} active={activeFolder === folder.id} label={folder.name} count={files.filter((file) => file.folderId === folder.id).length} onClick={() => setActiveFolder(folder.id)} />)}
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <div className="mb-5 flex items-center justify-between"><p className="text-base font-semibold text-app-text">저장된 파일</p><span className="rounded-full border border-app-border bg-app-bg px-3 py-1 text-xs font-medium text-app-muted">{visibleFiles.length}개</span></div>
          {visibleFiles.length === 0 ? <EmptyState icon={Image} title="파일이 없습니다" description="현재 폴더나 형식에 해당하는 파일이 없습니다." /> : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleFiles.map((file) => <FileCard key={file.id} file={file} folders={folders} onMove={moveFile} />)}
            </div>
          )}
        </SurfaceCard>
      </div>
    </div>
  );
}

function FolderButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold ${active ? "bg-app-hover text-app-primary" : "text-app-muted hover:bg-app-bg"}`}><Folder size={15} /><span className="min-w-0 flex-1 truncate">{label}</span><span>{count}</span></button>;
}

function FileCard({ file, folders, onMove }: { file: PublicFileRecord; folders: PublicFolder[]; onMove: (fileId: string, folderId: string) => Promise<void> }) {
  const Icon = file.category === "image" ? FileImage : file.category === "excel" ? FileSpreadsheet : file.category === "pdf" ? FileText : File;
  return <article className="min-w-0 rounded-app border border-app-border bg-white p-4 shadow-soft"><div className="mb-3 flex min-w-0 items-center gap-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-app-hover text-app-primary"><Icon size={17} /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-app-text" title={file.name}>{file.name}</p><p className="mt-1 text-[11px] text-app-muted">{formatBytes(file.size)} · {file.source}</p></div></div>{file.textPreview ? <p className="mb-3 line-clamp-2 text-xs leading-5 text-slate-600">{file.textPreview}</p> : null}<label className="block text-[10px] font-semibold text-app-muted">폴더<select value={file.folderId || ""} onChange={(event) => void onMove(file.id, event.target.value)} className="mt-1 h-9 w-full rounded-xl border border-app-border bg-white px-2 text-xs text-app-text outline-none"><option value="">분류되지 않음</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>{file.downloadable ? <a href={`/api/files/${file.id}/download`} download className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-app-primary text-xs font-bold text-white"><Download size={14} />다운로드</a> : <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-center text-[11px] font-semibold text-amber-700">원본 파일 없음</p>}</article>;
}

async function readPreview(file: globalThis.File) {
  if (file.type.startsWith("text/") || /\.(md|txt|json|csv|tsv|js|ts|tsx|css|html|xml|yaml|yml)$/iu.test(file.name)) return (await file.text()).slice(0, 12000);
  return "";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
