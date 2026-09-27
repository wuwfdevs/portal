import Link from "next/link";
import { cn } from "@/lib/cn";
import type { ComponentProps } from "react";

/**
 * A primary-styled <Link> — the "+ New X" action on a list toolbar, or any
 * navigation that should read as the screen's main button. Same classes as
 * Button's primary variant; a link because it navigates rather than submits.
 */
export function PrimaryLink({ className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded bg-brand-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-[#2278B8]",
        className,
      )}
      {...props}
    />
  );
}
