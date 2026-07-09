import type { ExternalIdentityMatch } from "./types";

export function matchExternalIdentity(input: {
  source: ExternalIdentityMatch["source"];
  externalId: string;
  email?: string | null;
  candidateName?: string | null;
}): ExternalIdentityMatch {
  const email = input.email?.trim().toLowerCase() || "unknown@example.local";
  const knownBusinessEmail = !email.endsWith("@example.local") && !email.endsWith("@gmail.com");

  return {
    id: `identity_match_${input.source}_${input.externalId}`,
    source: input.source,
    externalId: input.externalId,
    email,
    candidateName: input.candidateName || email.split("@")[0] || "Unknown",
    candidateType: input.source === "slack" ? "project" : "customer",
    confidence: knownBusinessEmail ? 0.82 : 0.58,
    status: knownBusinessEmail ? "auto_matched" : "suggested",
    createdAt: new Date().toISOString()
  };
}

export function createKnowledgeCandidatePath(input: {
  source: "gmail" | "calendar" | "slack";
  customerName?: string;
  projectName?: string;
}) {
  if (input.source === "gmail") return "Knowledge/External/Gmail/";
  if (input.source === "calendar") {
    return input.projectName
      ? `Projects/${input.projectName}/Meetings/`
      : "Knowledge/External/Calendar/";
  }
  return input.projectName
    ? `Projects/${input.projectName}/Decisions/`
    : "Knowledge/External/Slack/";
}
