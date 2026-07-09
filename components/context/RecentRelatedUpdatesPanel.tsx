import { Clock3 } from "lucide-react";
import { PanelShell } from "@/components/context/PanelShell";
import { ResultList } from "@/components/context/ResultList";
import type { SearchResult } from "@/src/lib/search/search.types";

export function RecentRelatedUpdatesPanel({
  results,
  onPreview
}: {
  results: SearchResult[];
  onPreview: (result: SearchResult) => void;
}) {
  return (
    <PanelShell title="최근 관련 업데이트" icon={Clock3}>
      <ResultList results={results} emptyText="최근 관련 업데이트가 없습니다." onPreview={onPreview} />
    </PanelShell>
  );
}
