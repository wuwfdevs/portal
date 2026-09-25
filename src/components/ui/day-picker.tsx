import { cn } from "@/lib/cn";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Seven day-of-week pills as a checkbox group (0 = Sunday … 6 = Saturday,
 * matching log_schedule.days_of_week). Native checkboxes styled through
 * `peer-checked`; pass `value`/`onToggle` from a client component to
 * control it, or leave both off inside a plain <form action>.
 */
export function DayPicker({
  name,
  value,
  defaultValue,
  onToggle,
  className,
}: {
  name: string;
  value?: number[];
  defaultValue?: number[];
  onToggle?: (day: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {DAY_LABELS.map((label, day) => (
        <label key={label} className="relative block cursor-pointer">
          <input
            type="checkbox"
            name={name}
            value={day}
            className="peer sr-only"
            checked={value !== undefined ? value.includes(day) : undefined}
            defaultChecked={value === undefined ? defaultValue?.includes(day) : undefined}
            onChange={onToggle ? () => onToggle(day) : undefined}
          />
          <span className="inline-flex h-9 w-11 items-center justify-center rounded border border-line bg-white text-[13px] font-semibold text-ink-700 peer-checked:border-brand-link peer-checked:bg-brand-link peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand-surface">
            {label}
          </span>
        </label>
      ))}
    </div>
  );
}
