import { FileText } from "lucide-react";
import { PanelShell } from "@/components/context/PanelShell";
import { ResultList } from "@/components/context/ResultList";
import type { SearchResult } from "@/src/lib/search/search.types";

export function RelatedDocumentsPanel({
  results,
  onPreview
}: {
  results: SearchResult[];
  onPreview: (result: SearchResult) => void;
}) {
  return (
    <PanelShell title="관련 문서" icon={FileText}>
      <ResultList
        results={results}
        emptyText="로컬 문서 또는 웹 검색 관련 문서가 아직 없습니다."
        onPreview={onPreview}
      />
    </PanelShell>
  );
}
