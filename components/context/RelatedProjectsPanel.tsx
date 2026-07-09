import { FolderKanban } from "lucide-react";
import { PanelShell } from "@/components/context/PanelShell";
import { ResultList } from "@/components/context/ResultList";
import type { SearchResult } from "@/src/lib/search/search.types";

export function RelatedProjectsPanel({
  results,
  onPreview
}: {
  results: SearchResult[];
  onPreview: (result: SearchResult) => void;
}) {
  return (
    <PanelShell title="관련 프로젝트" icon={FolderKanban}>
      <ResultList results={results} emptyText="연결된 프로젝트가 없습니다." onPreview={onPreview} />
    </PanelShell>
  );
}
