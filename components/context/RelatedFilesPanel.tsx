import { File } from "lucide-react";
import { PanelShell } from "@/components/context/PanelShell";
import { ResultList } from "@/components/context/ResultList";
import type { SearchResult } from "@/src/lib/search/search.types";

export function RelatedFilesPanel({
  results,
  onPreview
}: {
  results: SearchResult[];
  onPreview: (result: SearchResult) => void;
}) {
  return (
    <PanelShell title="관련 파일" icon={File}>
      <ResultList results={results} emptyText="관련 파일이 없습니다." onPreview={onPreview} />
    </PanelShell>
  );
}
