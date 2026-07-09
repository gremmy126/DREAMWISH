"use client";

type SegmentedControlProps<T extends string> = {
  options: T[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange
}: SegmentedControlProps<T>) {
  return (
    <div className="inline-flex rounded-2xl border border-app-border bg-white p-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
            value === option
              ? "bg-app-primary text-white shadow-soft"
              : "text-app-muted hover:bg-app-hover hover:text-app-primary"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
