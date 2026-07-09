type ProgressBarProps = {
  value: number;
  max: number;
  label?: string;
};

export function ProgressBar({ value, max, label }: ProgressBarProps) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div>
      {label ? (
        <div className="mb-2 flex items-center justify-between text-xs text-app-muted">
          <span>{label}</span>
          <span className="font-medium text-app-text">
            {value}GB / {max}GB
          </span>
        </div>
      ) : null}
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-app-primary"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
