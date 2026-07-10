import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AnswerConfidence,
  AnswerVerification,
  ChatMessageRecord,
  ChatRole,
  ChatSessionDetail,
  ChatSessionRecord,
  SourceDocument
} from "@/src/lib/chat/chat.types";
import type { SearchResult } from "@/src/lib/search/search.types";
import { normalizeSearchText } from "@/src/lib/search/search-text";

type LocalChatDb = {
  chat_sessions: ChatSessionRecord[];
  chat_messages: ChatMessageRecord[];
};

const DB_DIR = path.join(process.cwd(), ".local-db");
const DB_PATH = path.join(DB_DIR, "chat.json");

export async function createSession(title = "새 대화") {
  const db = await readDb();
  const now = new Date().toISOString();
  const session: ChatSessionRecord = {
    id: randomUUID(),
    title,
    created_at: now,
    updated_at: now,
    archived_at: null
  };

  db.chat_sessions.unshift(session);
  await writeDb(db);
  return session;
}

export async function listSessions() {
  const db = await readDb();
  return db.chat_sessions
    .filter((session) => !session.archived_at)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function getSession(id: string): Promise<ChatSessionDetail | null> {
  const db = await readDb();
  const session = db.chat_sessions.find(
    (item) => item.id === id && !item.archived_at
  );

  if (!session) return null;

  return {
    session,
    messages: db.chat_messages
      .filter((message) => message.session_id === id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  };
}

export async function addMessage(input: {
  sessionId: string;
  role: Exclude<ChatRole, "system">;
  content: string;
  sources?: SourceDocument[] | null;
  confidence?: AnswerConfidence | null;
  verification?: AnswerVerification | null;
}) {
  const db = await readDb();
  const now = new Date().toISOString();
  const message: ChatMessageRecord = {
    id: randomUUID(),
    session_id: input.sessionId,
    role: input.role,
    content: input.content,
    sources_json: input.sources || null,
    confidence_json: input.confidence || null,
    verification_json: input.verification || null,
    created_at: now
  };

  db.chat_messages.push(message);
  const session = db.chat_sessions.find((item) => item.id === input.sessionId);
  if (session) session.updated_at = now;

  await writeDb(db);
  return message;
}

export async function updateSessionTitle(id: string, title: string) {
  const db = await readDb();
  const session = db.chat_sessions.find((item) => item.id === id);

  if (!session) return null;

  session.title = title;
  session.updated_at = new Date().toISOString();
  await writeDb(db);
  return session;
}

export async function archiveSession(id: string) {
  const db = await readDb();
  const session = db.chat_sessions.find((item) => item.id === id);

  if (!session) return false;

  const now = new Date().toISOString();
  session.archived_at = now;
  session.updated_at = now;
  await writeDb(db);
  return true;
}

export async function deleteSession(id: string) {
  const db = await readDb();
  const before = db.chat_sessions.length;
  db.chat_sessions = db.chat_sessions.filter((session) => session.id !== id);
  db.chat_messages = db.chat_messages.filter((message) => message.session_id !== id);

  if (db.chat_sessions.length === before) return false;

  await writeDb(db);
  return true;
}

export async function searchChatMessages(query: string, limit = 8): Promise<SearchResult[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  const terms = tokenize(normalized);
  const db = await readDb();
  const sessionsById = new Map(db.chat_sessions.map((session) => [session.id, session]));

  return db.chat_messages
    .map((message) => {
      const haystack = message.content.toLowerCase();
      const score = terms.reduce(
        (sum, term) => sum + (haystack.includes(term) ? 1 : 0),
        haystack.includes(normalized) ? 2 : 0
      );
      return { message, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ message, score }) => {
      const session = sessionsById.get(message.session_id);
      return {
        documentId: message.id,
        title: session?.title || "대화 기록",
        path: `chat://${message.session_id}/${message.id}`,
        snippet: makeSnippet(message.content),
        score: normalize(score, Math.max(2, terms.length + 2)),
        matchedBy: "chat",
        sourceType: "chat",
        updatedAt: message.created_at
      };
    });
}

export async function ensureSession(sessionId: string | undefined, message: string) {
  if (sessionId) {
    const existing = await getSession(sessionId);
    if (existing) return existing.session;
  }

  return createSession(makeSessionTitle(message));
}

async function readDb(): Promise<LocalChatDb> {
  await fs.mkdir(DB_DIR, { recursive: true });

  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as LocalChatDb;

    return {
      chat_sessions: Array.isArray(parsed.chat_sessions) ? parsed.chat_sessions : [],
      chat_messages: Array.isArray(parsed.chat_messages) ? parsed.chat_messages : []
    };
  } catch {
    return { chat_sessions: [], chat_messages: [] };
  }
}

async function writeDb(db: LocalChatDb) {
  await fs.mkdir(DB_DIR, { recursive: true });
  const tempPath = `${DB_PATH}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tempPath, DB_PATH);
}

function makeSessionTitle(message: string) {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) return "새 대화";
  return normalized.length > 36 ? `${normalized.slice(0, 36)}...` : normalized;
}

function tokenize(value: string) {
  return Array.from(new Set(value.match(/[가-힣a-z0-9_]{2,}/giu) || []));
}

function normalize(value: number, max: number) {
  return Number(Math.min(0.99, value / max).toFixed(2));
}

function makeSnippet(content: string) {
  return normalizeSearchText(content).slice(0, 360);
}
