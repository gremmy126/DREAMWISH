export type StoragePercent = {
  label: string;
  widthPercent: number;
};

export function calculateStoragePercent(usageBytes: number, quotaBytes: number | null): StoragePercent | null {
  if (!quotaBytes || quotaBytes <= 0) return null;
  const rawPercent = (Math.max(0, usageBytes) / quotaBytes) * 100;
  const clamped = Math.min(100, rawPercent);
  return {
    label: `${clamped.toFixed(2)}%`,
    widthPercent: clamped > 0 && clamped < 1 ? 1 : clamped
  };
}
