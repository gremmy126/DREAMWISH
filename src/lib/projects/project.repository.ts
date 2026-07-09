import { randomUUID } from "node:crypto";
import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

export type ProjectRecord = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectSessionLink = {
  projectId: string;
  sessionId: string;
  createdAt: string;
};

type ProjectDb = {
  projects: ProjectRecord[];
  sessionLinks: ProjectSessionLink[];
};

const EMPTY_DB: ProjectDb = { projects: [], sessionLinks: [] };

export async function listProjects() {
  return (await readDb()).projects;
}

export async function createProject(input: { name: string }) {
  const now = new Date().toISOString();
  const project: ProjectRecord = {
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

export async function assignSessionToProject(input: { projectId: string; sessionId: string }) {
  const db = await readDb();
  const existing = db.sessionLinks.find((link) => link.sessionId === input.sessionId);
  if (existing) existing.projectId = input.projectId;
  else db.sessionLinks.unshift({ ...input, createdAt: new Date().toISOString() });
  await writeDb(db);
  return { projectId: input.projectId, sessionId: input.sessionId };
}

export async function listProjectSessionLinks() {
  return (await readDb()).sessionLinks;
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
