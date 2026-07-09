import type { KnowledgeNote } from "./knowledge.repository";

export type KnowledgeTabId = "network" | "documents" | "tags" | "recommendations";

export const KNOWLEDGE_MEMORY_TABS: Array<{
  id: KnowledgeTabId;
  label: string;
  description: string;
}> = [
  {
    id: "network",
    label: "Knowledge Network",
    description: "Entity and relationship map from approved memory and notes."
  },
  {
    id: "documents",
    label: "Documents",
    description: "Knowledge notes and uploaded source documents."
  },
  {
    id: "tags",
    label: "Tags",
    description: "Tag clusters that connect documents, people, projects, and memory."
  },
  {
    id: "recommendations",
    label: "Connection Recommendations",
    description: "Suggested document, app, and website connections."
  }
];

export type KnowledgeTabModel = {
  documents: KnowledgeNote[];
  tags: Array<{ tag: string; count: number; noteIds: string[] }>;
  recommendations: Array<{
    id: string;
    title: string;
    reason: string;
    targetType: "document" | "tag" | "app" | "website";
    targetId: string;
    strength: number;
  }>;
};

export function buildKnowledgeTabModel(notes: KnowledgeNote[]): KnowledgeTabModel {
  const tags = buildTagList(notes);
  const documentRecommendations = notes.slice(0, 4).map((note) => ({
    id: `document:${note.id}`,
    title: note.title,
    reason: note.tags.length
      ? `Shares tags: ${note.tags.slice(0, 3).join(", ")}`
      : "Recent knowledge document without explicit links.",
    targetType: "document" as const,
    targetId: note.id,
    strength: note.tags.length ? 0.72 : 0.42
  }));
  const tagRecommendations = tags.slice(0, 3).map((tag) => ({
    id: `tag:${tag.tag}`,
    title: `#${tag.tag}`,
    reason: `${tag.count} knowledge items can be grouped through this tag.`,
    targetType: "tag" as const,
    targetId: tag.tag,
    strength: Math.min(0.9, 0.42 + tag.count * 0.08)
  }));
  const externalRecommendations = [
    {
      id: "app:github",
      title: "GitHub",
      reason: "Connect repositories and issues to project knowledge.",
      targetType: "app" as const,
      targetId: "github",
      strength: 0.68
    },
    {
      id: "website:firebase",
      title: "Firebase",
      reason: "Connect Firebase project configuration to deployment knowledge.",
      targetType: "website" as const,
      targetId: "firebase",
      strength: 0.62
    }
  ];

  return {
    documents: notes,
    tags,
    recommendations: [
      ...documentRecommendations,
      ...tagRecommendations,
      ...externalRecommendations
    ].sort((a, b) => b.strength - a.strength)
  };
}

function buildTagList(notes: KnowledgeNote[]) {
  const byTag = new Map<string, { tag: string; count: number; noteIds: string[] }>();
  for (const note of notes) {
    for (const rawTag of note.tags) {
      const tag = rawTag.trim();
      if (!tag) continue;
      const current = byTag.get(tag) || { tag, count: 0, noteIds: [] };
      current.count += 1;
      current.noteIds.push(note.id);
      byTag.set(tag, current);
    }
  }

  return [...byTag.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
