import {
  AlertTriangle,
  BarChart3,
  Building2,
  CircleHelp,
  Database,
  FileSearch,
  FlaskConical,
  Landmark,
  Lightbulb,
  LineChart,
  Repeat2,
  ScrollText,
  Target,
  UsersRound,
  Video
} from "lucide-react";
import type { MemoryOsType } from "@/src/lib/memory-os/memory-os.types";

// 타입별 색·아이콘 — 레퍼런스 디자인의 파스텔 배지 팔레트.
export const TYPE_STYLES: Record<
  MemoryOsType,
  { color: string; soft: string; icon: typeof Target }
> = {
  decision: { color: "#6d5df6", soft: "#f2f0ff", icon: Target },
  research: { color: "#0ea5e9", soft: "#eaf6fe", icon: FileSearch },
  lesson: { color: "#f59e0b", soft: "#fef5e7", icon: Lightbulb },
  outcome: { color: "#16a34a", soft: "#eafaf0", icon: BarChart3 },
  pattern: { color: "#ec4899", soft: "#fdeef6", icon: Repeat2 },
  policy: { color: "#8b5cf6", soft: "#f3effe", icon: Landmark },
  knowledge: { color: "#64748b", soft: "#f1f5f9", icon: ScrollText },
  meeting: { color: "#14b8a6", soft: "#e8faf7", icon: Video },
  idea: { color: "#eab308", soft: "#fdf9e3", icon: Lightbulb },
  question: { color: "#a855f7", soft: "#f8f0fe", icon: CircleHelp },
  risk: { color: "#ef4444", soft: "#fdeeee", icon: AlertTriangle },
  customer: { color: "#f97316", soft: "#fef2e8", icon: UsersRound },
  market: { color: "#3b82f6", soft: "#ecf3fe", icon: LineChart },
  competitor: { color: "#dc2626", soft: "#fdecec", icon: Building2 },
  simulation: { color: "#06b6d4", soft: "#e7f9fc", icon: FlaskConical }
};

export const DATA_STYLE_ICON = Database;
