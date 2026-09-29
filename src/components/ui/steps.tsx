import Link from "next/link";
import { cn } from "@/lib/cn";

export interface StepItem {
  label: string;
  /** Where the step lives; a done step links there, the current and future ones don't. */
  href?: string;
}

/**
 * A numbered step indicator for a multi-screen flow (a new contract's five
 * steps) or a multi-stage one on a single screen (the program-log import's
 * upload, review, confirm). Steps before `current` are done and, when they
 * have an href, link back; the current one is highlighted; later ones are
 * plain. A `current` past the last step marks every step done.
 *
 * `busy` says the current step is working — its marker becomes a spinning
 * ring, and `busyNote` (a few words: "reading the file") follows its label.
 * The ring stops under prefers-reduced-motion; the note is what carries the
 * meaning either way.
 */
export function Steps({
  steps,
  current,
  busy = false,
  busyNote,
  label = "Steps",
  className,
}: {
  steps: StepItem[];
  current: number;
  busy?: boolean;
  busyNote?: string;
  /** The list's accessible name, when "Steps" is too generic ("Import steps"). */
  label?: string;
  className?: string;
}) {
  return (
    <ol
      aria-label={label}
      className={cn("flex max-w-4xl flex-wrap items-center gap-3 sm:gap-3.5", className)}
    >
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        const working = active && busy;
        const marker = working ? (
          <span
            aria-hidden="true"
            className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center text-xs font-bold text-brand-link"
          >
            <span className="absolute inset-0 animate-spin rounded-full border-2 border-brand-surface border-t-brand-primary motion-reduce:animate-none" />
            {index + 1}
          </span>
        ) : (
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
            {working && busyNote && <span className="font-normal text-ink-500">· {busyNote}</span>}
          </span>
        );
        return (
          <li key={step.label} className="flex items-center gap-3 sm:gap-3.5">
            {done && step.href ? (
              <Link href={step.href} className="hover:underline">
                {body}
              </Link>
            ) : (
              <span aria-current={active ? "step" : undefined} aria-busy={working || undefined}>
                {body}
              </span>
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
