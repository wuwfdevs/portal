"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";
import { SparklesIcon } from "./sparkles-icon";
import { TAP_TARGET } from "./tap-target";
import type { ControlRowPlacement } from "./control-row";
import type { ComponentProps, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link" | "danger-link";
type ButtonSize = "md" | "sm";

interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 44px tall below `lg` for a ghost/link button; boxed variants always are. */
  touch?: boolean;
  /** The button starts a model run: it carries the sparkles mark (and says so to nobody else). */
  ai?: boolean;
  /**
   * An icon that stands in for the label below `sm`: the button becomes a 44px square (a fixed
   * control in a control row, docs/ui-patterns.md) and the label stays for screen readers.
   */
  phoneIcon?: ReactNode;
  /** Where it sits in a control row below `sm` (see `ControlRowPlacement`). */
  row?: ControlRowPlacement;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-primary text-white hover:bg-brand-hover disabled:bg-panel-100 disabled:text-ink-400",
  secondary:
    "bg-transparent text-brand-link border border-brand-link hover:bg-brand-surface disabled:border-line disabled:text-ink-400",
  ghost: "bg-transparent text-brand-link px-1 hover:underline disabled:text-ink-400",
  danger: "bg-danger text-white hover:bg-danger/90 disabled:bg-panel-100 disabled:text-ink-400",
  // Inline text-style actions (a row's "Retire", "Remove"): no box, no padding.
  link: "bg-transparent px-0 py-0 text-xs font-semibold text-ink-500 hover:underline disabled:text-ink-400",
  "danger-link":
    "bg-transparent px-0 py-0 text-xs font-semibold text-danger hover:underline disabled:text-ink-400",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "px-4 py-2.5 text-sm",
  sm: "px-3 py-1.5 text-xs",
};

// A box button is at least 44px tall below `lg`, so every one is a touch target
// without a call site remembering to say so. Text-style variants stay inline
// (dense rows) unless the caller passes `touch`.
const BOXED_VARIANTS = new Set<ButtonVariant>(["primary", "secondary", "danger"]);

/**
 * Nearly every mutation in this codebase is a plain <form action={serverAction}>
 * with a <Button type="submit"> inside it — the dominant action pattern across
 * every tool (105 files import this component). That form has a real
 * network+server round trip before the page re-renders, and until now nothing
 * about the button signaled that a click had registered: it just sat there,
 * identical to its resting state, for however long the action took — a real,
 * systemic gap, not one screen's problem. useFormStatus reads the nearest
 * ancestor <form>'s pending state for free, with no call site needing to
 * change, so a submit button now disables (also closing off accidental
 * double-submits) and shows a spinner the moment its form starts submitting,
 * everywhere at once. A button with an explicit type="button" is never a form
 * submission, so it's left alone; type omitted defaults to "submit" in HTML
 * inside a form, same as the browser's own behavior.
 */
export function Button({
  variant = "primary",
  size = "md",
  touch = false,
  ai = false,
  phoneIcon,
  row,
  className,
  children,
  ...props
}: ButtonProps) {
  const { pending } = useFormStatus();
  const isPendingSubmit = pending && props.type !== "button";

  return (
    <button
      aria-busy={isPendingSubmit || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded font-bold transition-colors disabled:cursor-not-allowed",
        variant !== "link" && variant !== "danger-link" && SIZE_CLASSES[size],
        (touch || BOXED_VARIANTS.has(variant)) && TAP_TARGET,
        VARIANT_CLASSES[variant],
        phoneIcon ? "phone-icon" : undefined,
        className,
      )}
      data-row={row ?? (phoneIcon ? "fixed" : undefined)}
      {...props}
      disabled={isPendingSubmit || props.disabled}
    >
      {isPendingSubmit && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {ai && !isPendingSubmit && <SparklesIcon className="h-3.5 w-3.5 shrink-0" />}
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
    </button>
  );
}
