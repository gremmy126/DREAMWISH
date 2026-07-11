import { randomUUID } from "node:crypto";
import { getSession } from "@/src/lib/db/repositories/chat.repository";
import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

export type ProjectRecord = {
  ownerId: string;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectSessionLink = {
  ownerId: string;
  projectId: string;
  sessionId: string;
  createdAt: string;
};

type ProjectDb = {
  projects: ProjectRecord[];
  sessionLinks: ProjectSessionLink[];
};

const EMPTY_DB: ProjectDb = { projects: [], sessionLinks: [] };

export class ProjectSessionLinkNotFoundError extends Error {
  readonly code = "PROJECT_SESSION_LINK_NOT_FOUND" as const;
  readonly status = 404 as const;

  constructor() {
    super("Project or chat session not found");
    this.name = "ProjectSessionLinkNotFoundError";
  }
}

export async function listProjects(ownerId: string) {
  return (await readDb()).projects.filter((project) => project.ownerId === ownerId);
}

export async function createProject(input: { ownerId: string; name: string }) {
  const now = new Date().toISOString();
  const project: ProjectRecord = {
    ownerId: input.ownerId,
    id: randomUUID(),
    name: input.name.trim() || "새 프로젝트",
    createdAt: now,
    updatedAt: now
  };
  const db = await readDb();
  db.projects.unshift(project);
  await writeDb(db);
  return project;
}

export async function assignSessionToProject(input: {
  ownerId: string;
  projectId: string;
  sessionId: string;
}) {
  const db = await readDb();
  const project = db.projects.find(
    (item) => item.id === input.projectId && item.ownerId === input.ownerId
  );
  if (!project || !(await getSession(input.ownerId, input.sessionId))) {
    throw new ProjectSessionLinkNotFoundError();
  }

  const existing = db.sessionLinks.find(
    (link) => link.ownerId === input.ownerId && link.sessionId === input.sessionId
  );
  if (existing) existing.projectId = input.projectId;
  else db.sessionLinks.unshift({ ...input, createdAt: new Date().toISOString() });
  await writeDb(db);
  return existing || db.sessionLinks[0];
}

export async function listProjectSessionLinks(ownerId: string) {
  return (await readDb()).sessionLinks.filter((link) => link.ownerId === ownerId);
}

async function readDb() {
  const db = await readJsonStore<ProjectDb>("projects.json", EMPTY_DB);
  return {
    projects: Array.isArray(db.projects) ? db.projects : [],
    sessionLinks: Array.isArray(db.sessionLinks) ? db.sessionLinks : []
  };
}

function writeDb(db: ProjectDb) {
  return writeJsonStore("projects.json", db);
}
