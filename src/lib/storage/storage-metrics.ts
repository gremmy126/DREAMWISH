export type StoragePercent = {
  label: string;
  widthPercent: number;
};

export function calculateStoragePercent(usageBytes: number, quotaBytes: number | null): StoragePercent | null {
  if (!quotaBytes || quotaBytes <= 0) return null;
  if (usageBytes <= 0) return { label: "0%", widthPercent: 0 };

  const rawPercent = (usageBytes / quotaBytes) * 100;
  if (rawPercent > 0 && rawPercent < 1) {
    return { label: `${formatSmallPercent(rawPercent)}%`, widthPercent: 1 };
  }

  const rounded = Math.min(100, Math.round(rawPercent));
  return {
    label: `${rounded}%`,
    widthPercent: rounded
  };
}

function formatSmallPercent(rawPercent: number) {
  const decimals = rawPercent < 0.01 ? 3 : 2;
  const rounded = rawPercent.toFixed(decimals);
  return rounded.replace(/\.?0+$/u, "") || "0";
}
