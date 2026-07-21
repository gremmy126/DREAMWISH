import { randomUUID } from "node:crypto";
import {
  mutateOwnerState,
  readOwnerState,
  type OwnerStateStore
} from "../db/owner-state-store";

// Organization members for the Team page. Members drive survey targeting and
// the §16 roles (organization_owner / organization_admin / member — the
// decision_owner role is derived from decision.createdBy).

export type TeamRole = "organization_owner" | "organization_admin" | "member";

export type TeamMember = {
  id: string;
  email: string;
  name: string;
  role: TeamRole;
  createdAt: string;
};

export type TeamMeeting = {
  id: string;
  title: string;
  decisionId: string | null;
  date: string;
  notes: string;
  summary: string | null;
  actionItems: string[];
  conclusion: string | null;
  createdAt: string;
  updatedAt: string;
};

// Decision Chat — 결정 단위의 협업 코멘트(설문과 달리 실명 협업 공간).
export type DecisionComment = {
  id: string;
  decisionId: string;
  author: string;
  text: string;
  parentId: string | null;
  resolved: boolean;
  createdAt: string;
};

type TeamState = {
  members: TeamMember[];
  meetings: TeamMeeting[];
  comments: DecisionComment[];
};

const TEAM_STORE: OwnerStateStore<TeamState> = {
  namespace: "team-state",
  fileName: "team.json",
  fallback: () => ({ members: [], meetings: [], comments: [] })
};

export async function listTeamMembers(ownerId: string): Promise<TeamMember[]> {
  const state = await readOwnerState(TEAM_STORE, ownerId);
  return [...state.members].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function addTeamMember(
  ownerId: string,
  input: { email: string; name?: string; role?: TeamRole }
): Promise<TeamMember> {
  const email = normalizeEmail(input.email);
  if (!email) throw new Error("올바른 이메일을 입력하세요.");
  return mutateOwnerState(TEAM_STORE, ownerId, (state) => {
    const existing = state.members.find((member) => member.email === email);
    if (existing) return structuredClone(existing);
    const member: TeamMember = {
      id: randomUUID(),
      email,
      name: input.name?.trim().slice(0, 100) || email.split("@")[0],
      role: isTeamRole(input.role) ? input.role : "member",
      createdAt: new Date().toISOString()
    };
    state.members.push(member);
    return structuredClone(member);
  });
}

export async function updateTeamMember(
  ownerId: string,
  memberId: string,
  patch: { name?: string; role?: TeamRole }
): Promise<TeamMember | null> {
  return mutateOwnerState(TEAM_STORE, ownerId, (state) => {
    const member = state.members.find((candidate) => candidate.id === memberId);
    if (!member) return null;
    if (typeof patch.name === "string" && patch.name.trim()) {
      member.name = patch.name.trim().slice(0, 100);
    }
    if (isTeamRole(patch.role)) member.role = patch.role;
    return structuredClone(member);
  });
}

export async function removeTeamMember(ownerId: string, memberId: string): Promise<boolean> {
  return mutateOwnerState(TEAM_STORE, ownerId, (state) => {
    const index = state.members.findIndex((candidate) => candidate.id === memberId);
    if (index < 0) return false;
    state.members.splice(index, 1);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

export async function listMeetings(ownerId: string): Promise<TeamMeeting[]> {
  const state = await readOwnerState(TEAM_STORE, ownerId);
  return [...(state.meetings || [])].sort((a, b) => b.date.localeCompare(a.date));
}

export async function createMeeting(
  ownerId: string,
  input: { title: string; decisionId?: string | null; notes?: string; date?: string }
): Promise<TeamMeeting> {
  const title = String(input.title || "").trim();
  if (!title) throw new Error("회의 제목을 입력하세요.");
  const now = new Date().toISOString();
  const meeting: TeamMeeting = {
    id: randomUUID(),
    title: title.slice(0, 160),
    decisionId: input.decisionId || null,
    date: input.date || now,
    notes: String(input.notes || "").slice(0, 20000),
    summary: null,
    actionItems: [],
    conclusion: null,
    createdAt: now,
    updatedAt: now
  };
  await mutateOwnerState(TEAM_STORE, ownerId, (state) => {
    state.meetings = state.meetings || [];
    state.meetings.unshift(meeting);
  });
  return meeting;
}

export async function updateMeeting(
  ownerId: string,
  meetingId: string,
  patch: Partial<Pick<TeamMeeting, "title" | "notes" | "summary" | "actionItems" | "conclusion" | "decisionId">>
): Promise<TeamMeeting | null> {
  return mutateOwnerState(TEAM_STORE, ownerId, (state) => {
    const meeting = (state.meetings || []).find((candidate) => candidate.id === meetingId);
    if (!meeting) return null;
    if (typeof patch.title === "string" && patch.title.trim()) meeting.title = patch.title.trim().slice(0, 160);
    if (typeof patch.notes === "string") meeting.notes = patch.notes.slice(0, 20000);
    if (patch.summary !== undefined) meeting.summary = patch.summary;
    if (Array.isArray(patch.actionItems)) meeting.actionItems = patch.actionItems.slice(0, 20);
    if (patch.conclusion !== undefined) meeting.conclusion = patch.conclusion;
    if (patch.decisionId !== undefined) meeting.decisionId = patch.decisionId;
    meeting.updatedAt = new Date().toISOString();
    return structuredClone(meeting);
  });
}

// ---------------------------------------------------------------------------
// Decision Chat comments
// ---------------------------------------------------------------------------

export async function listComments(
  ownerId: string,
  decisionId: string
): Promise<DecisionComment[]> {
  const state = await readOwnerState(TEAM_STORE, ownerId);
  return (state.comments || [])
    .filter((comment) => comment.decisionId === decisionId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function addComment(
  ownerId: string,
  input: { decisionId: string; author: string; text: string; parentId?: string | null }
): Promise<DecisionComment> {
  const text = String(input.text || "").trim();
  if (!text) throw new Error("댓글 내용을 입력하세요.");
  const comment: DecisionComment = {
    id: randomUUID(),
    decisionId: input.decisionId,
    author: input.author.slice(0, 60),
    text: text.slice(0, 2000),
    parentId: input.parentId || null,
    resolved: false,
    createdAt: new Date().toISOString()
  };
  await mutateOwnerState(TEAM_STORE, ownerId, (state) => {
    state.comments = state.comments || [];
    state.comments.push(comment);
  });
  return comment;
}

export async function resolveComment(
  ownerId: string,
  commentId: string,
  resolved: boolean
): Promise<DecisionComment | null> {
  return mutateOwnerState(TEAM_STORE, ownerId, (state) => {
    const comment = (state.comments || []).find((candidate) => candidate.id === commentId);
    if (!comment) return null;
    comment.resolved = resolved;
    return structuredClone(comment);
  });
}

function isTeamRole(value: unknown): value is TeamRole {
  return value === "organization_owner" || value === "organization_admin" || value === "member";
}

function normalizeEmail(raw: unknown): string {
  const email = String(raw || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ? email : "";
}
