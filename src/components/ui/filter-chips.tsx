import Link from "next/link";
import { cn } from "@/lib/cn";

export interface FilterChip {
  label: string;
  href: string;
  active: boolean;
  count?: number;
}

/** A row of link chips for a list's filter, one pressed at a time — a query-string filter, so it works with no client JavaScript. */
export function FilterChips({
  chips,
  label,
  className,
}: {
  chips: FilterChip[];
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {chips.map((chip) => (
        <Link
          key={chip.href}
          href={chip.href}
          aria-pressed={chip.active}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold",
            chip.active
              ? "border-brand-surface bg-brand-surface text-brand-link"
              : "border-line bg-white text-ink-700 hover:border-brand-primary",
          )}
        >
          {chip.label}
          {chip.count !== undefined && <span className="text-ink-500">· {chip.count}</span>}
        </Link>
      ))}
    </div>
  );
}
