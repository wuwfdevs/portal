import Link from "next/link";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export interface DetailSummaryItem {
  label: string;
  value: ReactNode;
  /** Render line breaks in a multi-line value (a mailing address). */
  preserveLines?: boolean;
}

/**
 * The read-only field list in a detail page's right column (docs/ui-patterns.md
 * rule 5): a titled card with an Edit link and a two-column <dl>. An empty
 * value shows as an em dash rather than a blank row, so the list keeps its
 * shape from one record to the next.
 */
export function DetailSummary({
  title,
  editHref,
  editLabel = "Edit",
  items,
  className,
}: {
  title: string;
  editHref?: string;
  editLabel?: string;
  items: DetailSummaryItem[];
  className?: string;
}) {
  return (
    <div className={cn("rounded border border-line bg-white", className)}>
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <span className="text-sm font-bold text-ink-900">{title}</span>
        {editHref && (
          <Link href={editHref} className="px-1 text-sm font-bold text-brand-link hover:underline">
            {editLabel}
          </Link>
        )}
      </div>
      <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2.5 px-5 py-4 text-[13px]">
        {items.map((item) => {
          const empty = item.value === null || item.value === undefined || item.value === "";
          return (
            <div key={item.label} className="contents">
              <dt className="text-ink-500">{item.label}</dt>
              <dd
                className={cn("min-w-0 text-ink-900", item.preserveLines && "whitespace-pre-line")}
              >
                {empty ? "—" : item.value}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
