import { NotebookTabs } from "lucide-react";
import { PanelShell } from "@/components/context/PanelShell";
import { ResultList } from "@/components/context/ResultList";
import type { SearchResult } from "@/src/lib/search/search.types";

export function RelatedNotesPanel({
  results,
  onPreview
}: {
  results: SearchResult[];
  onPreview: (result: SearchResult) => void;
}) {
  return (
    <PanelShell title="관련 노트" icon={NotebookTabs}>
      <ResultList results={results} emptyText="관련 노트가 없습니다." onPreview={onPreview} />
    </PanelShell>
  );
}
