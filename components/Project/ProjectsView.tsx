import {
  CalendarClock,
  FolderKanban,
  Plus,
  Tag,
  TrendingUp
} from "lucide-react";
import { EmptyState } from "@/components/Common/EmptyState";
import { SectionHeader } from "@/components/Common/SectionHeader";
import { SurfaceCard } from "@/components/Common/SurfaceCard";

export function ProjectsView() {
  return (
    <div className="space-y-5">
      <SurfaceCard className="p-6">
        <SectionHeader
          icon={FolderKanban}
          title="프로젝트"
          description="프로젝트 카드 리스트 UI입니다. 프로젝트 데이터는 아직 만들지 않았습니다."
          action={
            <button
              type="button"
              className="flex h-10 items-center gap-2 rounded-2xl bg-app-primary px-4 text-sm font-medium text-white shadow-soft transition hover:brightness-105"
            >
              <Plus size={16} />
              새 프로젝트
            </button>
          }
        />
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-app border border-dashed border-app-border bg-app-bg p-5">
            <TrendingUp size={18} className="mb-3 text-app-primary" />
            <p className="text-sm font-semibold text-app-text">진행률</p>
            <p className="mt-1 text-xs leading-5 text-app-muted">
              프로젝트 생성 후 표시됩니다.
            </p>
          </div>
          <div className="rounded-app border border-dashed border-app-border bg-app-bg p-5">
            <Tag size={18} className="mb-3 text-app-primary" />
            <p className="text-sm font-semibold text-app-text">태그</p>
            <p className="mt-1 text-xs leading-5 text-app-muted">
              프로젝트 태그가 표시됩니다.
            </p>
          </div>
          <div className="rounded-app border border-dashed border-app-border bg-app-bg p-5">
            <CalendarClock size={18} className="mb-3 text-app-primary" />
            <p className="text-sm font-semibold text-app-text">마감일</p>
            <p className="mt-1 text-xs leading-5 text-app-muted">
              프로젝트 마감일이 표시됩니다.
            </p>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard className="min-h-[480px] p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-base font-semibold text-app-text">
              프로젝트 카드 리스트
            </p>
            <p className="mt-1 text-sm text-app-muted">
              프로젝트가 추가되면 카드로 정렬됩니다.
            </p>
          </div>
          <span className="rounded-full border border-app-border bg-app-bg px-3 py-1 text-xs font-medium text-app-muted">
            최근 프로젝트
          </span>
        </div>
        <EmptyState
          icon={FolderKanban}
          title="프로젝트 없음"
          description="표시할 프로젝트가 없습니다."
        />
      </SurfaceCard>
    </div>
  );
}
