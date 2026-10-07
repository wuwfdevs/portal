import Link from "next/link";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

const TONE = {
  neutral: "text-ink-900",
  accent: "text-brand-link",
  success: "text-success-fg",
  warning: "text-warning-fg",
  danger: "text-danger",
} as const;

/** A number with a label under a card border; a link when `href` is given. */
export function StatTile({
  label,
  value,
  hint,
  href,
  tone = "neutral",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: keyof typeof TONE;
  className?: string;
}) {
  const body = (
    <>
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{label}</div>
      <div className={cn("mt-1 font-serif text-2xl font-bold tabular-nums", TONE[tone])}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-ink-500">{hint}</div>}
    </>
  );
  const classes = cn("block rounded border border-line bg-white px-4 py-3.5", className);
  return href ? (
    <Link href={href} className={cn(classes, "hover:bg-panel-50")}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
