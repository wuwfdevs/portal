import Link from "next/link";
import { cn } from "@/lib/cn";

export type ScheduleView = "line" | "date";

const OPTIONS: { value: ScheduleView; label: string }[] = [
  { value: "line", label: "By line" },
  { value: "date", label: "By date" },
];

/**
 * The Schedule tab's "By line | By date" switch. Drawn like `Segmented`, but
 * as links so the view lives in the URL (`?view=date`) — `Segmented` is a
 * radio group for forms.
 */
export function ViewToggle({ base, view }: { base: string; view: ScheduleView }) {
  return (
    <nav
      aria-label="Schedule view"
      className="inline-flex max-w-full overflow-hidden rounded border border-line"
    >
      {OPTIONS.map((option) => (
        <Link
          key={option.value}
          href={option.value === "line" ? base : `${base}?view=date`}
          aria-current={view === option.value ? "page" : undefined}
          className={cn(
            "inline-flex h-9 items-center border-r border-line px-3.5 text-[13px] font-semibold last:border-r-0",
            view === option.value
              ? "bg-brand-surface text-brand-link"
              : "bg-white text-ink-700 hover:bg-panel-50",
          )}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}
