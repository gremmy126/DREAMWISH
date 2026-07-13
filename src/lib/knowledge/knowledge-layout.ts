export type KnowledgeGraphLike = {
  nodes: ReadonlyArray<{
    id: string;
    label: string;
    type: string;
    confidence: number;
    sourceIds: readonly string[];
  }>;
  edges: ReadonlyArray<{
    id: string;
    from: string;
    to: string;
    type: string;
    confidence: number;
    sourceIds: readonly string[];
  }>;
};

export type KnowledgeLayoutNode = {
  id: string;
  label: string;
  type: string;
  confidence: number;
  sourceIds: string[];
  degree: number;
  x: number;
  y: number;
  radius: number;
};

export type KnowledgeLayoutEdge = {
  id: string;
  source: string;
  target: string;
  type: string;
  confidence: number;
};

export function buildInitialKnowledgeLayout(graph: KnowledgeGraphLike, width = 920, height = 520) {
  const degree = new Map<string, number>();
  for (const edge of graph.edges) {
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
  }
  const ordered = [...graph.nodes].sort((a, b) =>
    (degree.get(b.id) || 0) - (degree.get(a.id) || 0) || a.label.localeCompare(b.label)
  );
  const centerX = width / 2;
  const centerY = height / 2;
  const nodes = ordered.map((node, index) => {
    const nodeDegree = degree.get(node.id) || 0;
    const ring = index === 0 ? 0 : Math.floor((index - 1) / 8) + 1;
    const ringIndex = index === 0 ? 0 : (index - 1) % 8;
    const angle = (ringIndex / 8) * Math.PI * 2 + ring * 0.28;
    const distance = ring * Math.min(width, height) * 0.25;
    return {
      id: node.id,
      label: node.label,
      type: node.type,
      confidence: node.confidence,
      sourceIds: [...node.sourceIds],
      degree: nodeDegree,
      x: index === 0 ? centerX : centerX + Math.cos(angle) * distance,
      y: index === 0 ? centerY : centerY + Math.sin(angle) * distance,
      radius: Math.min(31, 10 + Math.sqrt(nodeDegree + 1) * 5)
    } satisfies KnowledgeLayoutNode;
  });
  return {
    nodes,
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      type: edge.type,
      confidence: edge.confidence
    })) satisfies KnowledgeLayoutEdge[]
  };
}

export type KnowledgeTimelineEvent = {
  id: string;
  title: string;
  type: "candidate" | "approved" | "external";
  createdAt: string;
};

export function buildKnowledgeTimeline(events: readonly KnowledgeTimelineEvent[]) {
  const ordered = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const groupMap = new Map<string, KnowledgeTimelineEvent[]>();
  for (const event of ordered) {
    const key = event.createdAt.slice(0, 7);
    const group = groupMap.get(key) || [];
    group.push(event);
    groupMap.set(key, group);
  }
  return {
    events: ordered,
    groups: [...groupMap].map(([key, items]) => ({ key, items }))
  };
}
