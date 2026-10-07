import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * "Nothing here yet": a dashed box with a plain sentence and, optionally, the
 * action that fills it. `compact` is the slimmer variant for a kanban column
 * or a card's empty body.
 */
export function EmptyState({
  title,
  action,
  compact,
  className,
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded border border-dashed border-line text-sm text-ink-500",
        compact ? "px-4 py-5" : "max-w-md p-6",
        className,
      )}
    >
      {title && <div className="font-bold text-ink-700">{title}</div>}
      {children && <div className={cn(!!title && "mt-1")}>{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
