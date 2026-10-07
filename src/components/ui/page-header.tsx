import Link from "next/link";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

const TITLE_SIZE = {
  page: "text-2xl",
  form: "text-xl",
  public: "text-[20px]",
} as const;

/**
 * The title block at the top of a screen: an optional back link and eyebrow,
 * a serif title with a badge beside it, a description, and the screen's
 * actions on the right. `size` is the three heights the portal actually uses —
 * a tool's landing page, a detail or form page, and a public form.
 */
export function PageHeader({
  title,
  eyebrow,
  back,
  badge,
  description,
  actions,
  size = "form",
  as: Heading = "h1",
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  back?: { href: string; label: string };
  badge?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  size?: keyof typeof TITLE_SIZE;
  as?: "h1" | "h2";
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="px-1 text-sm font-bold text-brand-link hover:underline">
            ← {back.label}
          </Link>
        )}
        {eyebrow && (
          <div className="mt-2 text-xs font-bold uppercase tracking-wide text-ink-400">
            {eyebrow}
          </div>
        )}
        <div className={cn("flex flex-wrap items-center gap-3", !!(back || eyebrow) && "mt-2")}>
          <Heading className={cn("font-serif font-bold text-ink-900", TITLE_SIZE[size])}>
            {title}
          </Heading>
          {badge}
        </div>
        {description && (
          <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
