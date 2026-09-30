import { cn } from "@/lib/cn";
import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

// The portal's one table look: a bordered frame, a quiet uppercase header, and
// hairline-separated rows. A table with `stack` turns each row into a card
// below `md` instead of scrolling sideways (docs/ui-patterns.md, "Tables on
// narrow screens"); the rules for that live in globals.css under
// `.table-stack`, and each Cell says what it becomes in the card. A table
// without `stack` still scrolls horizontally inside its frame.

export function TableFrame({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("overflow-x-auto rounded border border-line", className)} {...props} />;
}

export function Table({
  className,
  stack = false,
  ...props
}: HTMLAttributes<HTMLTableElement> & {
  /** Below `md`, lay each row out as a card rather than scrolling columns. */
  stack?: boolean;
}) {
  return <table className={cn("w-full text-sm", stack && "table-stack", className)} {...props} />;
}

export function HeaderRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-line bg-panel-50 text-left text-[11px] font-bold uppercase tracking-wide text-ink-500",
        className,
      )}
      {...props}
    />
  );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("whitespace-nowrap px-4 py-2.5 font-bold", className)} {...props} />;
}

export function Row({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("border-b border-line last:border-b-0 hover:bg-panel-50/60", className)}
      {...props}
    />
  );
}

/**
 * What a cell becomes when its table stacks into cards (a phone):
 * - `title`: the card's heading, top left — the row's name or link.
 * - `aside`: top right, beside the title — a status badge or a count.
 * - `hide`: left out of the card — something the title or another field repeats.
 * - `full`: its own line, full width, no label — actions, a long excerpt.
 * A cell with a `label` and none of these is a labelled field ("Airs  8:00 PM").
 */
export type CellStack = "title" | "aside" | "hide" | "full";

export function Cell({
  className,
  label,
  stack,
  children,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & {
  /** The column's name, shown beside the value when the table stacks. */
  label?: string;
  stack?: CellStack;
  children?: ReactNode;
}) {
  const field = label !== undefined && stack === undefined;
  return (
    <td
      className={cn("px-4 py-3 align-top", className)}
      data-stack={stack ?? (field ? "field" : undefined)}
      {...props}
    >
      {field ? (
        <>
          {/* Hidden (and so silent) at table widths, where the column header names it. */}
          <span className="table-stack-label">{label}</span>
          <div className="min-w-0">{children}</div>
        </>
      ) : (
        children
      )}
    </td>
  );
}
