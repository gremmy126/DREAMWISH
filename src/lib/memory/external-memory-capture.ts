import { createMemoryCandidate } from "@/src/lib/memory/memory-engine";
import { upsertMemoryCandidate } from "@/src/lib/memory/memory-repository";
import type {
  ExternalCaptureStep,
  MemoryCandidate,
  MemorySource
} from "@/src/lib/memory/memory.types";

export async function captureExternalMemoryCandidate(input: {
  connectorId: string;
  sourceId: string;
  title: string;
  content: string;
  preview: string;
  projectId?: string | null;
}): Promise<MemoryCandidate & { executionTrail: ExternalCaptureStep[] }> {
  const candidate = await createMemoryCandidate({
    source: connectorToMemorySource(input.connectorId),
    sourceId: input.sourceId,
    title: input.title,
    content: input.content,
    preview: input.preview,
    projectId: input.projectId || null,
    confidence: 0.7
  });
  const executionTrail: ExternalCaptureStep[] = [
    "Planner",
    "Permission",
    "Preview",
    "Approval",
    "Capture",
    "Knowledge Update"
  ];
  const withTrail = {
    ...candidate,
    executionTrail
  };
  await upsertMemoryCandidate(withTrail);
  return withTrail;
}

function connectorToMemorySource(connectorId: string): MemorySource {
  if (connectorId === "gmail") return "gmail";
  if (connectorId === "google-calendar") return "google-calendar";
  if (connectorId === "slack") return "slack";
  return "manual";
}
