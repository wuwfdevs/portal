import { cn } from "@/lib/cn";
import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1.5 block text-xs font-semibold text-ink-700", className)}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded border border-line px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400",
        "focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-surface",
        className,
      )}
      {...props}
    />
  );
}

export function FieldError({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-xs text-danger">{children}</p>;
}

export function FieldHint({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-xs text-ink-400">{children}</p>;
}
