export type StoragePercent = {
  label: string;
  widthPercent: number;
};

const SMALL_PERCENT_DECIMALS = 4;
const SMALL_PERCENT_FLOOR = 0.0001;

export function calculateStoragePercent(usageBytes: number, quotaBytes: number | null): StoragePercent | null {
  if (!quotaBytes || quotaBytes <= 0) return null;
  const rawPercent = (Math.max(0, usageBytes) / quotaBytes) * 100;
  const clamped = Math.min(100, rawPercent);
  return {
    label: formatStoragePercentLabel(clamped),
    widthPercent: clamped > 0 && clamped < 1 ? 1 : clamped
  };
}

// Small non-zero usage must never render as "0.00%": with a 10GiB quota a
// multi-megabyte upload is far below 0.01%, so two decimals hide real growth.
export function formatStoragePercentLabel(percent: number): string {
  if (percent <= 0) return "0.00%";
  if (percent >= 0.01) return `${percent.toFixed(2)}%`;
  const floored = Math.max(percent, SMALL_PERCENT_FLOOR);
  return `${floored.toFixed(SMALL_PERCENT_DECIMALS)}%`;
}
