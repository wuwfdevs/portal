import Link from "next/link";
import { cn } from "@/lib/cn";
import type { ComponentProps, ReactNode } from "react";

/**
 * A primary-styled <Link> — the "+ New X" action on a list toolbar, or any
 * navigation that should read as the screen's main button. Same classes as
 * Button's primary variant; a link because it navigates rather than submits.
 */
export function PrimaryLink({
  className,
  phoneIcon,
  children,
  ...props
}: ComponentProps<typeof Link> & {
  /**
   * An icon that stands in for the label below `sm`: a 44px square, a fixed control in a control
   * row, label kept for screen readers (the same option `Button` has). `ListToolbar`'s `primary`
   * uses it, so a list's "+ New X" never has to be abbreviated by hand.
   */
  phoneIcon?: ReactNode;
}) {
  return (
    <Link
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded bg-brand-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-[#2278B8]",
        phoneIcon ? "max-sm:min-h-11 max-sm:w-11 max-sm:flex-none max-sm:px-0" : undefined,
        className,
      )}
      data-row={phoneIcon ? "fixed" : undefined}
      {...props}
    >
      {phoneIcon ? (
        <>
          <span aria-hidden="true" className="sm:hidden">
            {phoneIcon}
          </span>
          <span className="max-sm:sr-only">{children}</span>
        </>
      ) : (
        children
      )}
    </Link>
  );
}

/** A bordered secondary <Link> — Button's secondary variant, for navigation. */
export function SecondaryLink({
  className,
  size = "md",
  ...props
}: ComponentProps<typeof Link> & { size?: "md" | "sm" }) {
  return (
    <Link
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded border border-brand-link bg-transparent font-bold text-brand-link hover:bg-brand-surface",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm",
        className,
      )}
      {...props}
    />
  );
}

/** An inline text link in the brand colour — "Back to schedule", "Edit", "Cancel". */
export function TextLink({ className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn("px-1 text-sm font-bold text-brand-link hover:underline", className)}
      {...props}
    />
  );
}
