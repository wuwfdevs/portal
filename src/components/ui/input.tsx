import { cn } from "@/lib/cn";
import type { ComponentProps, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

/**
 * One control style for every text input, select, and textarea in the portal.
 * Exported so the few client components that build their own inputs stay in
 * step instead of re-typing the class list.
 */
// iOS Safari auto-zooms the viewport on focus for any focusable text surface
// under 16px effective font-size. Single source of truth for staying above
// that line — reach for this on any custom focusable surface (a
// contenteditable div, a custom widget), not just Input/Select/Textarea
// below. This bug has recurred multiple times, each time on a different kind
// of control; see CLAUDE.md's "Rules for making changes."
export const MOBILE_SAFE_TEXT_SIZE = "text-base sm:text-sm";

export const controlClasses = cn(
  "w-full rounded border border-line bg-white px-3 py-2.5",
  MOBILE_SAFE_TEXT_SIZE,
  "text-ink-900 placeholder:text-ink-400",
  "focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-surface",
  "disabled:cursor-not-allowed disabled:bg-panel-50 disabled:text-ink-400",
);

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1.5 block text-xs font-semibold text-ink-700", className)}
      {...props}
    />
  );
}

// ComponentProps so a caller can pass a `ref` (React 19 forwards it as an
// ordinary prop) — ListSearch follows the URL into its box through one.
export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlClasses, className)} {...props} />;
}

// `compact` is for a select squeezed into a toolbar or a row (a playback-speed
// picker): tighter padding and width, but still MOBILE_SAFE_TEXT_SIZE.
export function Select({
  className,
  compact,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { compact?: boolean }) {
  return (
    <select className={cn(controlClasses, compact && "w-auto px-2 py-1", className)} {...props} />
  );
}

/** A checkbox or radio with its label: the `flex items-center gap-2` row used across forms. */
export function CheckboxField({
  label,
  hint,
  className,
  type = "checkbox",
  ...props
}: Omit<ComponentProps<"input">, "type" | "children"> & {
  label: ReactNode;
  hint?: ReactNode;
  type?: "checkbox" | "radio";
}) {
  return (
    <label className={cn("flex items-start gap-2 text-sm text-ink-700", className)}>
      <input type={type} className="mt-0.5 h-4 w-4 shrink-0" {...props} />
      <span className="min-w-0">
        {label}
        {hint && <span className="mt-0.5 block text-xs text-ink-400">{hint}</span>}
      </span>
    </label>
  );
}

/** A file picker styled like the other controls. */
export function FileInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  return (
    <input
      type="file"
      className={cn(
        controlClasses,
        "file:mr-3 file:rounded file:border-0 file:bg-brand-surface file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-brand-link",
        className,
      )}
      {...props}
    />
  );
}

/** Label + control + hint/error: the `<div><Label/><Input/><FieldHint/></div>` repeated across forms. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-danger"> *</span>}
      </Label>
      {children}
      {hint && <FieldHint>{hint}</FieldHint>}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

// ComponentProps rather than TextareaHTMLAttributes so a caller can pass a
// `ref` (React 19 forwards it as an ordinary prop) — the assistant widget
// focuses its compose box when Help hands it a draft.
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(controlClasses, "leading-relaxed", className)} {...props} />;
}

export function FieldError({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-xs text-danger">{children}</p>;
}

export function FieldHint({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-xs leading-snug text-ink-400">{children}</p>;
}
