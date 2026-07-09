import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  compact?: boolean;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  compact = false
}: EmptyStateProps) {
  return (
    <div
      className={`flex h-full min-h-0 flex-col items-center justify-center text-center ${
        compact ? "gap-2 px-3 py-5" : "gap-3 px-6 py-10"
      }`}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-app-hover text-app-primary">
        <Icon size={20} strokeWidth={1.8} />
      </div>
      <div>
        <p className="text-sm font-semibold text-app-text">{title}</p>
        <p className="mt-1 max-w-[260px] text-xs leading-5 text-app-muted">
          {description}
        </p>
      </div>
    </div>
  );
}
