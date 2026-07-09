import type { LucideIcon } from "lucide-react";

export function PanelShell({
  title,
  icon: Icon,
  children,
  action
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-app border border-app-border bg-white p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-app-hover text-app-primary">
            <Icon size={15} />
          </div>
          <h3 className="text-sm font-semibold text-app-text">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
