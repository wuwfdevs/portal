import Link from "next/link";
import { cn } from "@/lib/cn";

export interface StepItem {
  label: string;
  /** Where the step lives; a done step links there, the current and future ones don't. */
  href?: string;
}

/**
 * A numbered step indicator for a multi-screen flow (a new contract's four
 * steps). Steps before `current` are done and, when they have an href,
 * link back; the current one is highlighted; later ones are plain.
 */
export function Steps({
  steps,
  current,
  className,
}: {
  steps: StepItem[];
  current: number;
  className?: string;
}) {
  return (
    <ol
      aria-label="Steps"
      className={cn("flex max-w-4xl flex-wrap items-center gap-3 sm:gap-3.5", className)}
    >
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        const marker = (
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
              active
                ? "border-brand-primary bg-brand-primary text-white"
                : done
                  ? "border-success-border bg-success-bg text-success-fg"
                  : "border-line bg-white text-ink-500",
            )}
          >
            {done ? "✓" : index + 1}
          </span>
        );
        const body = (
          <span
            className={cn(
              "flex items-center gap-2.5 text-[13px] font-semibold",
              active ? "text-ink-900" : "text-ink-500",
            )}
          >
            {marker}
            {step.label}
          </span>
        );
        return (
          <li key={step.label} className="flex items-center gap-3 sm:gap-3.5">
            {done && step.href ? (
              <Link href={step.href} className="hover:underline">
                {body}
              </Link>
            ) : (
              <span aria-current={active ? "step" : undefined}>{body}</span>
            )}
            {index < steps.length - 1 && (
              <span aria-hidden="true" className="hidden h-px w-8 bg-line sm:block" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
