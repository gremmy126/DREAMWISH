"use client";

import { CheckCircle2, Clock3, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { SectionHeader } from "@/components/Common/SectionHeader";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import { ContextSearchPanel } from "@/components/context/ContextSearchPanel";
import { KnowledgeNetworkPanel } from "@/components/context/KnowledgeNetworkPanel";
import { RelatedDocumentsPanel } from "@/components/context/RelatedDocumentsPanel";
import { RelatedFilesPanel } from "@/components/context/RelatedFilesPanel";
import { RelatedNotesPanel } from "@/components/context/RelatedNotesPanel";
import { RelatedProjectsPanel } from "@/components/context/RelatedProjectsPanel";
import { SuggestedConnectionsPanel } from "@/components/context/SuggestedConnectionsPanel";
import type { ContextPayload } from "@/components/context/types";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import type { SearchResult } from "@/src/lib/search/search.types";

export function ConnectedContextWorkspace({ query }: { query: string }) {
  const [payload, setPayload] = useState<ContextPayload | null>(null);
  const [preview, setPreview] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useAppLanguage();

  useEffect(() => {
    if (!query.trim()) {
      setPayload(null);
      setPreview(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    fetch("/api/local/context/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: controller.signal
    })
      .then((response) => response.json())
      .then((data: ContextPayload) => {
        setPayload(data);
        setPreview(data.results?.[0] || data.conversationMatches?.[0] || data.webResults?.[0] || null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPayload(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [query]);

  function previewByPath(path: string) {
    const found = payload?.results.find((result) => result.path === path) ||
      payload?.conversationMatches.find((result) => result.path === path) ||
      payload?.webResults.find((result) => result.path === path);
    if (found) setPreview(found);
  }

  return (
    <SurfaceCard className="min-h-0 overflow-hidden p-5">
      <SectionHeader
        icon={Sparkles}
        title={t("context.title")}
        description={t("context.description")}
      />

      <div className="h-[calc(100vh-185px)] overflow-auto pr-1 app-scrollbar">
        {loading ? (
          <p className="rounded-app border border-app-border bg-app-bg p-4 text-sm text-app-muted">
            {t("context.loading")}
          </p>
        ) : null}

        {!payload ? (
          <p className="rounded-app border border-dashed border-app-border bg-app-bg p-6 text-center text-sm leading-6 text-app-muted">
            {t("context.empty")}
          </p>
        ) : (
          <div className="space-y-4">
            <KnowledgeNetworkPanel network={payload.network} onPreview={setPreview} />
            <ContextSearchPanel
              initialQuery={query}
              initialResults={payload.conversationMatches}
              onPreview={setPreview}
            />
            <RelatedDocumentsPanel results={payload.relatedDocuments} onPreview={setPreview} />
            <RelatedProjectsPanel results={payload.relatedProjects} onPreview={setPreview} />
            <RelatedNotesPanel results={payload.relatedNotes} onPreview={setPreview} />
            <RelatedFilesPanel results={payload.relatedFiles} onPreview={setPreview} />
            <SuggestedConnectionsPanel
              suggestions={payload.suggestions}
              onPreview={previewByPath}
            />
            <PlannerHistoryPanel />
            {preview ? (
              <section className="rounded-app border border-app-border bg-white p-4 shadow-soft">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="truncate text-sm font-semibold text-app-text">
                    {preview.title}
                  </h3>
                  <span className="text-[11px] font-semibold text-app-primary">
                    {preview.matchedBy}
                  </span>
                </div>
                {preview.url ? (
                  <a
                    href={preview.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mb-3 block truncate text-xs font-semibold text-app-primary"
                  >
                    {preview.url}
                  </a>
                ) : (
                  <p className="mb-3 truncate text-xs text-app-muted">{preview.path}</p>
                )}
                <p className="text-xs leading-5 text-slate-600">{preview.snippet}</p>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </SurfaceCard>
  );
}

function PlannerHistoryPanel() {
  const { t } = useAppLanguage();
  const steps = ["Planner", "Permission", "Approval", "Execute", "History"];
  return (
    <section className="rounded-app border border-app-border bg-white p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock3 size={15} className="text-app-primary" />
          <h3 className="text-sm font-semibold text-app-text">{t("context.plannerHistory")}</h3>
        </div>
        <span className="rounded-2xl border border-app-border bg-app-bg px-2 py-1 text-[11px] font-semibold text-app-muted">
          {t("context.approvalFirst")}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {steps.map((step, index) => (
          <div key={step} className="rounded-2xl border border-app-border bg-app-bg p-2 text-center">
            <CheckCircle2 size={13} className="mx-auto text-app-primary" />
            <p className="mt-1 truncate text-[11px] font-semibold text-app-text">{step}</p>
            <p className="mt-0.5 text-[10px] text-app-muted">{index + 1}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
