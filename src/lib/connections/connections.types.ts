export type SuggestedConnection = {
  sourceId: string;
  targetId: string;
  targetTitle: string;
  targetPath: string;
  reason: string;
  strength: number;
  relationType: string;
  targetType?: "document" | "tag" | "app" | "website";
  externalTargetId?: string;
  status: "suggested" | "accepted" | "rejected";
};
