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

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded font-bold text-sm px-4 py-2.5 transition-colors disabled:cursor-not-allowed",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}
