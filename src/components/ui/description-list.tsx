import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export interface DescriptionItem {
  label: ReactNode;
  value: ReactNode;
  preserveLines?: boolean;
}

const COLUMNS = {
  1: "grid-cols-[minmax(0,10rem)_minmax(0,1fr)]",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
} as const;

/**
 * A read-only list of label/value pairs. `columns={1}` is a label column beside
 * a value column; 2–4 stack each label over its value in a grid. An empty
 * value shows as an em dash so the list keeps its shape between records.
 */
export function DescriptionList({
  items,
  columns = 1,
  className,
}: {
  items: DescriptionItem[];
  columns?: keyof typeof COLUMNS;
  className?: string;
}) {
  const stacked = columns !== 1;
  return (
    <dl className={cn("grid gap-x-4 gap-y-2.5 text-[13px]", COLUMNS[columns], className)}>
      {items.map((item, i) => {
        const empty = item.value === null || item.value === undefined || item.value === "";
        const inner = (
          <>
            <dt className={cn("text-ink-500", stacked && "text-xs")}>{item.label}</dt>
            <dd className={cn("min-w-0 text-ink-900", item.preserveLines && "whitespace-pre-line")}>
              {empty ? "—" : item.value}
            </dd>
          </>
        );
        return stacked ? (
          <div key={i}>{inner}</div>
        ) : (
          <div key={i} className="contents">
            {inner}
          </div>
        );
      })}
    </dl>
  );
}
