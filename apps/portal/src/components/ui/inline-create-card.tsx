import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * The inline create form for a small record (docs/ui-patterns.md): a
 * highlighted card at the top of its list, opened by `?new=1` and closed by
 * a Cancel link back to the bare path — no client state. The whole card is
 * one <form action={serverAction}>; `children` is the body, and `sections`
 * are optional further blocks (each with its own `border-t border-line px-5
 * py-4`) between the body and the footer.
 */
export function InlineCreateCard({
  title,
  action,
  submitLabel,
  cancelHref,
  children,
  sections,
  className,
}: {
  title: string;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  cancelHref: string;
  children: ReactNode;
  sections?: ReactNode;
  className?: string;
}) {
  return (
    <form
      action={action}
      className={cn(
        "rounded border border-brand-primary bg-white ring-2 ring-brand-surface",
        className,
      )}
    >
      <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">{title}</div>
      <div className="px-5 py-4">{children}</div>
      {sections}
      <div className="flex items-center gap-4 border-t border-line px-5 py-3">
        <Button type="submit">{submitLabel}</Button>
        <Link href={cancelHref} className="px-1 text-sm font-bold text-brand-link hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
