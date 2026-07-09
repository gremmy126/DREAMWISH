import type { RiskLevel } from "@/src/lib/integrations/types";

const styles: Record<RiskLevel, string> = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-sky-200 bg-sky-50 text-sky-700",
  high: "border-amber-200 bg-amber-50 text-amber-700",
  critical: "border-red-200 bg-red-50 text-red-700"
};

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${styles[risk]}`}>
      {risk}
    </span>
  );
}
