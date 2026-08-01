import { cn } from "@/lib/cn";
import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/**
 * One control style for every text input, select, and textarea in the portal.
 * Exported so the few client components that build their own inputs stay in
 * step instead of re-typing the class list.
 */
// text-base below the sm breakpoint, dropping to text-sm at sm: and up —
// iOS Safari auto-zooms on focus for any input with a computed font-size
// under 16px, so this keeps mobile at 16px while preserving the existing
// 14px look everywhere the viewport is wide enough that zoom isn't a risk.
export const controlClasses = cn(
  "w-full rounded border border-line bg-white px-3 py-2.5 text-base text-ink-900 placeholder:text-ink-400 sm:text-sm",
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

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClasses, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlClasses, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClasses, "leading-relaxed", className)} {...props} />;
}

export function FieldError({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-xs text-danger">{children}</p>;
}

export function FieldHint({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-xs leading-snug text-ink-400">{children}</p>;
}
