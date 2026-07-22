import { randomUUID } from "node:crypto";
import type { AgentBuildKind } from "../agent/agent-build";
import { mutateOwnerDocument, readOwnerDocument } from "../db/owner-document-store";

// Persistent design artifacts produced by the Design Engine (or an MCP design
// server). Owner-scoped: every query runs inside the caller's namespace, so
// one user can never read another user's artifacts.

export type DesignArtifactStatus =
  | "draft"
  | "ready"
  | "review"
  | "approved"
  | "failed"
  | "archived";

export type DesignArtifactSource = "internal-engine" | "mcp";

export type DesignArtifactVersion = {
  versionId: string;
  code: string;
  note: string;
  createdAt: string;
};

export type DesignArtifact = {
  id: string;
  type: AgentBuildKind;
  title: string;
  source: DesignArtifactSource;
  /** MCP server id when source === "mcp". */
  sourceServerId: string | null;
  skillId: string | null;
  status: DesignArtifactStatus;
  code: string;
  versions: DesignArtifactVersion[];
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

type ArtifactDocument = { artifacts: DesignArtifact[] };

const NAMESPACE = "design.artifacts.v1";
const EMPTY: ArtifactDocument = { artifacts: [] };
const MAX_ARTIFACTS = 60;
const MAX_VERSIONS = 8;
const MAX_CODE_BYTES = 400_000;

const STATUS_FLOW: Record<DesignArtifactStatus, DesignArtifactStatus[]> = {
  draft: ["ready", "failed", "archived"],
  ready: ["review", "approved", "archived", "draft"],
  review: ["approved", "ready", "archived"],
  approved: ["archived", "ready"],
  failed: ["draft", "archived"],
  archived: ["draft"]
};

export function canTransitionArtifactStatus(
  from: DesignArtifactStatus,
  to: DesignArtifactStatus
): boolean {
  return STATUS_FLOW[from]?.includes(to) ?? false;
}

export async function listDesignArtifacts(ownerId: string): Promise<DesignArtifact[]> {
  const document = await readOwnerDocument<ArtifactDocument>(ownerId, NAMESPACE, EMPTY);
  return [...document.artifacts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDesignArtifact(
  ownerId: string,
  artifactId: string
): Promise<DesignArtifact | null> {
  const document = await readOwnerDocument<ArtifactDocument>(ownerId, NAMESPACE, EMPTY);
  return document.artifacts.find((artifact) => artifact.id === artifactId) ?? null;
}

export async function createDesignArtifact(
  ownerId: string,
  input: {
    type: AgentBuildKind;
    title: string;
    code: string;
    source: DesignArtifactSource;
    sourceServerId?: string | null;
    skillId?: string | null;
    metadata?: Record<string, string>;
  }
): Promise<DesignArtifact> {
  const now = new Date().toISOString();
  const artifact: DesignArtifact = {
    id: randomUUID(),
    type: input.type,
    title: input.title.trim().slice(0, 160) || "제목 없는 디자인",
    source: input.source,
    sourceServerId: input.sourceServerId ?? null,
    skillId: input.skillId ?? null,
    status: "ready",
    code: clampCode(input.code),
    versions: [],
    metadata: sanitizeMetadata(input.metadata),
    createdAt: now,
    updatedAt: now
  };

  await mutateOwnerDocument<ArtifactDocument, void>(ownerId, NAMESPACE, EMPTY, (document) => {
    document.artifacts.unshift(artifact);
    if (document.artifacts.length > MAX_ARTIFACTS) {
      // Drop the oldest archived/failed items first, then the oldest overall.
      const disposable = document.artifacts
        .filter((item) => item.status === "archived" || item.status === "failed")
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
      const victim = disposable[0] ?? document.artifacts[document.artifacts.length - 1];
      document.artifacts = document.artifacts.filter((item) => item.id !== victim.id);
    }
  });
  return artifact;
}

export async function updateDesignArtifact(
  ownerId: string,
  artifactId: string,
  patch: {
    title?: string;
    code?: string;
    versionNote?: string;
    status?: DesignArtifactStatus;
    metadata?: Record<string, string>;
  }
): Promise<DesignArtifact> {
  return mutateOwnerDocument<ArtifactDocument, DesignArtifact>(
    ownerId,
    NAMESPACE,
    EMPTY,
    (document) => {
      const artifact = document.artifacts.find((item) => item.id === artifactId);
      if (!artifact) throw new DesignArtifactNotFoundError(artifactId);

      if (typeof patch.title === "string" && patch.title.trim()) {
        artifact.title = patch.title.trim().slice(0, 160);
      }
      if (typeof patch.code === "string" && patch.code.trim()) {
        // Keep the outgoing code as a restorable version before replacing it.
        artifact.versions.unshift({
          versionId: randomUUID(),
          code: artifact.code,
          note: (patch.versionNote ?? "수정 전 버전").slice(0, 200),
          createdAt: artifact.updatedAt
        });
        artifact.versions = artifact.versions.slice(0, MAX_VERSIONS);
        artifact.code = clampCode(patch.code);
      }
      if (patch.status && patch.status !== artifact.status) {
        if (!canTransitionArtifactStatus(artifact.status, patch.status)) {
          throw new DesignArtifactStatusError(artifact.status, patch.status);
        }
        artifact.status = patch.status;
      }
      if (patch.metadata) {
        artifact.metadata = { ...artifact.metadata, ...sanitizeMetadata(patch.metadata) };
      }
      artifact.updatedAt = new Date().toISOString();
      return structuredClone(artifact);
    }
  );
}

export async function restoreDesignArtifactVersion(
  ownerId: string,
  artifactId: string,
  versionId: string
): Promise<DesignArtifact> {
  return mutateOwnerDocument<ArtifactDocument, DesignArtifact>(
    ownerId,
    NAMESPACE,
    EMPTY,
    (document) => {
      const artifact = document.artifacts.find((item) => item.id === artifactId);
      if (!artifact) throw new DesignArtifactNotFoundError(artifactId);
      const version = artifact.versions.find((item) => item.versionId === versionId);
      if (!version) throw new DesignArtifactNotFoundError(versionId);

      artifact.versions.unshift({
        versionId: randomUUID(),
        code: artifact.code,
        note: "롤백 전 버전",
        createdAt: artifact.updatedAt
      });
      artifact.code = version.code;
      artifact.versions = artifact.versions
        .filter((item) => item.versionId !== versionId)
        .slice(0, MAX_VERSIONS);
      artifact.status = "ready";
      artifact.updatedAt = new Date().toISOString();
      return structuredClone(artifact);
    }
  );
}

export async function deleteDesignArtifact(ownerId: string, artifactId: string): Promise<void> {
  await mutateOwnerDocument<ArtifactDocument, void>(ownerId, NAMESPACE, EMPTY, (document) => {
    const before = document.artifacts.length;
    document.artifacts = document.artifacts.filter((item) => item.id !== artifactId);
    if (document.artifacts.length === before) throw new DesignArtifactNotFoundError(artifactId);
  });
}

export class DesignArtifactNotFoundError extends Error {
  readonly code = "ARTIFACT_NOT_FOUND" as const;
  readonly status = 404 as const;

  constructor(id: string) {
    super(`Design artifact not found: ${id}`);
    this.name = "DesignArtifactNotFoundError";
  }
}

export class DesignArtifactStatusError extends Error {
  readonly code = "INVALID_STATUS_TRANSITION" as const;
  readonly status = 409 as const;

  constructor(from: DesignArtifactStatus, to: DesignArtifactStatus) {
    super(`Cannot move artifact status from ${from} to ${to}.`);
    this.name = "DesignArtifactStatusError";
  }
}

function clampCode(code: string): string {
  return code.length > MAX_CODE_BYTES ? code.slice(0, MAX_CODE_BYTES) : code;
}

function sanitizeMetadata(metadata?: Record<string, string>): Record<string, string> {
  const output: Record<string, string> = {};
  if (!metadata) return output;
  for (const [key, value] of Object.entries(metadata).slice(0, 20)) {
    if (typeof value === "string") output[key.slice(0, 60)] = value.slice(0, 400);
  }
  return output;
}
