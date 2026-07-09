import { CheckCircle2, Circle, KanbanSquare, LoaderCircle } from "lucide-react";
import { EmptyState } from "@/components/Common/EmptyState";
import { SectionHeader } from "@/components/Common/SectionHeader";
import { SurfaceCard } from "@/components/Common/SurfaceCard";

const columns = [
  { title: "Todo", icon: Circle },
  { title: "Doing", icon: LoaderCircle },
  { title: "Done", icon: CheckCircle2 }
];

export function TasksView() {
  return (
    <div className="space-y-5">
      <SurfaceCard className="p-6">
        <SectionHeader
          icon={KanbanSquare}
          title="작업"
          description="Todo, Doing, Done 흐름으로 작업을 정리합니다."
        />
      </SurfaceCard>

      <div className="grid min-h-[620px] grid-cols-3 gap-5">
        {columns.map((column, index) => {
          const Icon = column.icon;

          return (
            <SurfaceCard key={column.title} className="p-5" delay={index * 0.04}>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon size={17} className="text-app-primary" />
                  <p className="text-sm font-semibold text-app-text">
                    {column.title}
                  </p>
                </div>
                <span className="rounded-full bg-app-bg px-2 py-1 text-xs font-medium text-app-muted">
                  0
                </span>
              </div>
              <div className="h-[520px] rounded-app border border-dashed border-app-border bg-app-bg">
                <EmptyState
                  compact
                  icon={Icon}
                  title="카드 없음"
                  description="표시할 작업 카드가 없습니다."
                />
              </div>
            </SurfaceCard>
          );
        })}
      </div>
    </div>
  );
}
