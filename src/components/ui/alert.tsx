import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

type AlertVariant = "danger" | "info" | "note" | "warning" | "success";

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  danger: "border-danger/30 bg-danger/[0.06] text-danger",
  info: "border-brand-primary/25 bg-brand-surface/40 text-ink-700",
  note: "border-line bg-panel-50 text-ink-500",
  warning: "border-warning-border/60 bg-warning-bg text-warning-fg",
  success: "border-success-border bg-success-bg text-success-fg",
};

/**
 * The one way the portal reports something back to the user in place: a failed
 * write, a state explanation, a caveat about a screen. Kept deliberately plain
 * so it reads the same whether it sits above a form or inside a card.
 * `warning` asks for a decision before going on (a date that doesn't match);
 * `success` confirms a finished action on the screen it lands on.
 */
export function Alert({
  variant = "danger",
  children,
  className,
  action,
}: {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
  /** A control that sits beside the message (a "Fix it" link or button). */
  action?: ReactNode;
}) {
  return (
    <div
      role={variant === "danger" ? "alert" : undefined}
      className={cn(
        "rounded border px-3.5 py-2.5 text-xs leading-relaxed",
        !!action && "flex flex-wrap items-center justify-between gap-3",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {action ? <div className="min-w-0 flex-1">{children}</div> : children}
      {action}
    </div>
  );
}
