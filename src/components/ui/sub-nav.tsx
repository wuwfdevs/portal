import Link from "next/link";
import { cn } from "@/lib/cn";

export interface SubNavItem {
  href: string;
  label: string;
  active: boolean;
  /** Shown after the label, e.g. how many rows wait in that section. Omit (or 0) for none. */
  count?: number;
}

/**
 * The row of pages inside one top-level tab — a section's own navigation.
 * Deliberately not an underline (that is `TabNav`, where you are in the tool)
 * and not a pill (that is `FilterChips`, which narrows a list): a quiet grey
 * block marks the page you are on. See docs/ui-patterns.md, "Navigation shapes".
 */
export function SubNav({
  items,
  label,
  className,
}: {
  items: SubNavItem[];
  /** The landmark name a screen reader announces, e.g. "Schedule sections". */
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("mb-4 flex flex-wrap items-center gap-1", className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded px-3 text-[13px] font-semibold transition-colors",
            item.active
              ? "bg-panel-100 font-bold text-ink-900"
              : "text-ink-500 hover:bg-panel-50 hover:text-ink-700",
          )}
        >
          {item.label}
          {item.count ? <span className="font-bold text-ink-500">· {item.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
