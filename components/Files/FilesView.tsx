"use client";

import { File, FileImage, FileSpreadsheet, FileText, Folder, Image, Plus, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/Common/EmptyState";
import { SectionHeader } from "@/components/Common/SectionHeader";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import type { FileRecord } from "@/src/lib/files/file.repository";

const fileTypes = [
  { label: "Folders", icon: Folder },
  { label: "PDF", icon: FileText },
  { label: "Word", icon: File },
  { label: "Excel", icon: FileSpreadsheet },
  { label: "Image", icon: FileImage }
];

export function FilesView() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void loadFiles();
  }, []);

  async function loadFiles() {
    const response = await fetch("/api/files");
    const data = (await response.json()) as { files?: FileRecord[] };
    setFiles(data.files || []);
  }

  async function saveFile(file: globalThis.File) {
    const textPreview = await readPreview(file);
    const response = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        source: "files",
        textPreview,
        projectId: null
      })
    });
    if (response.ok) await loadFiles();
  }

  return (
    <div className="space-y-5">
      <SurfaceCard className="p-6">
        <SectionHeader
          icon={Folder}
          title="파일"
          description="Files 페이지와 AI Chat에서 첨부한 파일이 함께 저장됩니다."
          action={
            <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-app-primary px-3 text-xs font-semibold text-white">
              <Plus size={14} />파일 추가
            </button>
          }
        />
        <input ref={fileInputRef} type="file" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void saveFile(file); event.currentTarget.value = ""; }} />
        <div className="flex flex-wrap gap-3">
          {fileTypes.map((type) => {
            const Icon = type.icon;
            return <button type="button" key={type.label} className="flex h-11 items-center gap-2 rounded-2xl border border-app-border bg-white px-4 text-sm font-medium text-app-text shadow-soft transition hover:bg-app-hover hover:text-app-primary"><Icon size={16} />{type.label}</button>;
          })}
        </div>
      </SurfaceCard>

      <SurfaceCard className="min-h-[560px] p-6">
        <div className="mb-5 flex items-center justify-between">
          <p className="text-base font-semibold text-app-text">저장된 파일</p>
          <span className="rounded-full border border-app-border bg-app-bg px-3 py-1 text-xs font-medium text-app-muted">{files.length}개</span>
        </div>
        {files.length === 0 ? (
          <EmptyState icon={Image} title="파일 없음" description="파일 추가 또는 AI Chat 첨부를 통해 파일을 저장하세요." />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {files.map((file) => <article key={file.id} className="rounded-app border border-app-border bg-white p-4 shadow-soft"><div className="mb-3 flex items-center gap-2"><Upload size={15} className="text-app-primary" /><p className="truncate text-sm font-semibold text-app-text">{file.name}</p></div><p className="text-xs text-app-muted">{file.mimeType}</p><p className="mt-2 text-xs text-app-muted">{formatBytes(file.size)} · {file.source}</p>{file.textPreview ? <p className="mt-3 line-clamp-3 text-xs leading-5 text-slate-600">{file.textPreview}</p> : null}</article>)}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}

async function readPreview(file: globalThis.File) {
  if (file.type.startsWith("text/") || /\.(md|txt|json|csv|tsv|js|ts|tsx|css|html|xml|yaml|yml)$/iu.test(file.name)) {
    return (await file.text()).slice(0, 12000);
  }
  return "";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
