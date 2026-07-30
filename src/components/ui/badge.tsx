import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export type BadgeVariant = "accent" | "neutral" | "muted" | "danger" | "success" | "warning";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  accent: "bg-brand-surface text-brand-link",
  neutral: "bg-panel-100 text-ink-500",
  muted: "bg-panel-100 text-ink-400",
  danger: "bg-danger/[0.08] text-danger",
  success: "bg-success-bg text-success-fg",
  warning: "bg-warning-bg text-warning-fg",
};

export function Badge({ variant = "neutral", children }: { variant?: BadgeVariant; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
        VARIANT_CLASSES[variant],
      )}
    >
      {children}
    </span>
  );
}
