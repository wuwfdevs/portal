import Link from "next/link";
import { cn } from "@/lib/cn";
import { TAP_TARGET } from "@/components/ui/tap-target";
import type { ControlRowPlacement } from "@/components/ui/control-row";
import type { ComponentProps, ReactNode } from "react";

/**
 * A primary-styled <Link> — the "+ New X" action on a list toolbar, or any
 * navigation that should read as the screen's main button. Same classes (and the same
 * 44px phone tap target) as Button's primary variant; a link because it navigates rather than submits.
 */
export function PrimaryLink({
  className,
  phoneIcon,
  row,
  children,
  ...props
}: ComponentProps<typeof Link> & {
  /** Where it sits in a control row below `sm` (see `ControlRowPlacement`). */
  row?: ControlRowPlacement;
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
        "inline-flex items-center justify-center gap-1.5 rounded bg-brand-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-hover",
        TAP_TARGET,
        phoneIcon ? "phone-icon" : undefined,
        className,
      )}
      data-row={row ?? (phoneIcon ? "fixed" : undefined)}
      {...props}
    >
      {phoneIcon ? (
        <>
          <span aria-hidden="true" className="phone-icon__glyph">
            {phoneIcon}
          </span>
          <span className="phone-icon__label">{children}</span>
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
  phoneIcon,
  row,
  children,
  ...props
}: ComponentProps<typeof Link> & {
  /** Where it sits in a control row below `sm` (see `ControlRowPlacement`). */
  row?: ControlRowPlacement;
  size?: "md" | "sm";
  /** As on `PrimaryLink`: an icon square below `sm`, the label kept for screen readers. */
  phoneIcon?: ReactNode;
}) {
  return (
    <Link
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded border border-brand-link bg-transparent font-bold text-brand-link hover:bg-brand-surface",
        TAP_TARGET,
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm",
        phoneIcon ? "phone-icon" : undefined,
        className,
      )}
      data-row={row ?? (phoneIcon ? "fixed" : undefined)}
      {...props}
    >
      {phoneIcon ? (
        <>
          <span aria-hidden="true" className="phone-icon__glyph">
            {phoneIcon}
          </span>
          <span className="phone-icon__label">{children}</span>
        </>
      ) : (
        children
      )}
    </Link>
  );
}

/** An inline text link in the brand colour — "Back to schedule", "Edit", "Cancel". */
export function TextLink({
  className,
  row,
  ...props
}: ComponentProps<typeof Link> & {
  /** Where it sits in a control row below `sm` (see `ControlRowPlacement`). */
  row?: ControlRowPlacement;
}) {
  return (
    <Link
      className={cn("px-1 text-sm font-bold text-brand-link hover:underline", className)}
      data-row={row}
      {...props}
    />
  );
}
