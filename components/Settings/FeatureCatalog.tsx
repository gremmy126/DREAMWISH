import { CheckCircle2, CircleDashed, Clock3 } from "lucide-react";
import { productFeatureGroups, type FeatureStatus } from "@/src/lib/product/features";

const statusMeta: Record<
  FeatureStatus,
  {
    label: string;
    className: string;
    icon: typeof CheckCircle2;
  }
> = {
  ready: {
    label: "사용 가능",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2
  },
  partial: {
    label: "부분 연결",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    icon: CircleDashed
  },
  planned: {
    label: "예정",
    className: "border-slate-200 bg-slate-50 text-slate-600",
    icon: Clock3
  }
};

export function FeatureCatalog() {
  return (
    <div className="grid grid-cols-3 gap-4">
      {productFeatureGroups.map((group, index) => {
        const meta = statusMeta[group.status];
        const Icon = meta.icon;

        return (
          <article
            key={group.id}
            className="rounded-app border border-app-border bg-white p-4 shadow-soft"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-app-muted">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-1 text-sm font-semibold text-app-text">
                  {group.title}
                </h3>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${meta.className}`}
              >
                <Icon size={12} />
                {meta.label}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {group.items.map((item) => {
                const itemMeta = statusMeta[item.status];
                return (
                  <span
                    key={item.title}
                    title={itemMeta.label}
                    className={`rounded-full border px-2 py-1 text-[11px] font-medium ${itemMeta.className}`}
                  >
                    {item.title}
                  </span>
                );
              })}
            </div>
          </article>
        );
      })}
    </div>
  );
}
