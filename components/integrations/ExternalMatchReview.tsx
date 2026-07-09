"use client";

import { Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ExternalIdentityMatch } from "@/src/lib/integrations/types";

export function ExternalMatchReview() {
  const [matches, setMatches] = useState<ExternalIdentityMatch[]>([]);

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/integrations/matches");
      const data = (await response.json()) as { matches?: ExternalIdentityMatch[] };
      setMatches(data.matches || []);
    }
    void load();
  }, []);

  return (
    <div className="rounded-app border border-app-border bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Link2 size={15} className="text-app-primary" />
        <h3 className="text-sm font-semibold text-app-text">External Match Review</h3>
      </div>
      <div className="space-y-2">
        {matches.length === 0 ? (
          <p className="text-xs leading-5 text-app-muted">
            Sync 후 CRM, Project, Knowledge 연결 후보가 표시됩니다.
          </p>
        ) : (
          matches.map((match) => (
            <div
              key={match.id}
              className="flex items-center justify-between rounded-2xl border border-app-border bg-app-bg px-3 py-2 text-xs"
            >
              <span className="font-semibold text-app-text">{match.source}</span>
              <span className="text-app-muted">{match.candidateType}</span>
              <span className="font-semibold text-app-primary">
                {Math.round(match.confidence * 100)}%
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
