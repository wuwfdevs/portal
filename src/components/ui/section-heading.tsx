import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * A heading inside a screen. `eyebrow` is the small uppercase label over a
 * block; `title` is the serif section title. `action` sits at the right edge
 * (a "See all" link); `count` is a quiet number beside the text.
 */
export function SectionHeading({
  level = "title",
  as: Heading = "h2",
  count,
  action,
  className,
  children,
  id,
}: {
  level?: "eyebrow" | "title";
  as?: "h2" | "h3";
  count?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  const heading = (
    <Heading
      id={id}
      className={cn(
        level === "eyebrow"
          ? "text-xs font-bold uppercase tracking-wide text-ink-400"
          : "font-serif text-[17px] font-bold text-ink-900",
        !action && className,
      )}
    >
      {children}
      {count !== undefined && count !== null && (
        <span className="ml-2 font-sans text-xs font-semibold text-ink-400">{count}</span>
      )}
    </Heading>
  );
  if (!action) return heading;
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      {heading}
      {action}
    </div>
  );
}

/** The header strip of a card: `border-b border-line px-5 py-3.5 text-sm font-bold`. */
export function CardHeader({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900",
        className,
      )}
    >
      {children}
    </div>
  );
}
