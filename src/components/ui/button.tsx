"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-primary text-white hover:bg-[#2278B8] disabled:bg-panel-100 disabled:text-ink-400",
  secondary:
    "bg-transparent text-brand-link border border-brand-link hover:bg-brand-surface disabled:border-line disabled:text-ink-400",
  ghost: "bg-transparent text-brand-link px-1 hover:underline disabled:text-ink-400",
};

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
export function Button({ variant = "primary", className, children, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  const isPendingSubmit = pending && props.type !== "button";

  return (
    <button
      aria-busy={isPendingSubmit || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded font-bold text-sm px-4 py-2.5 transition-colors disabled:cursor-not-allowed",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
      disabled={isPendingSubmit || props.disabled}
    >
      {isPendingSubmit && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
