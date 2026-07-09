export type DocumentQualityIssue = {
  path: string;
  title: string;
  severity: "info" | "warning" | "error";
  type:
    | "missing_frontmatter"
    | "missing_title"
    | "missing_purpose"
    | "missing_summary"
    | "low_links"
    | "missing_tags"
    | "missing_update_log"
    | "orphan"
    | "duplicate_possible"
    | "too_long"
    | "too_short"
    | "ai_readability"
    | "broken_link";
  message: string;
};

export type DocumentQualityReport = {
  checkedAt: string;
  totalDocuments: number;
  issues: DocumentQualityIssue[];
  summary: string;
};
