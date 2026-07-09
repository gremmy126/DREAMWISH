import type { LucideIcon } from "lucide-react";

type SectionHeaderProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function SectionHeader({
  icon: Icon,
  title,
  description,
  action
}: SectionHeaderProps) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-app-hover text-app-primary">
            <Icon size={19} strokeWidth={1.8} />
          </div>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-app-text">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-5 text-app-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
