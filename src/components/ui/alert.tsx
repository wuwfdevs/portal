import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

type AlertVariant = "danger" | "info" | "note";

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  danger: "border-danger/30 bg-danger/[0.06] text-danger",
  info: "border-brand-primary/25 bg-brand-surface/40 text-ink-700",
  note: "border-line bg-panel-50 text-ink-500",
};

/**
 * The one way the portal reports something back to the user in place: a failed
 * write, a state explanation, a caveat about a screen. Kept deliberately plain
 * so it reads the same whether it sits above a form or inside a card.
 */
export function Alert({
  variant = "danger",
  children,
  className,
}: {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={variant === "danger" ? "alert" : undefined}
      className={cn(
        "rounded border px-3.5 py-2.5 text-xs leading-relaxed",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </div>
  );
}
