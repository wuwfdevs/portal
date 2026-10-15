import type { ReactNode } from "react";
import { ControlRow } from "@/components/ui/control-row";
import { SecondaryLink } from "@/components/ui/primary-link";
import { cn } from "@/lib/cn";

/**
 * The footer of a create or edit form (docs/ui-patterns.md, "Form footers"): Cancel, then the
 * primary action last, on the right from `sm` up and sharing the row on a phone. Every form ends in
 * this, so Cancel never changes shape or side between tools. `cancelHref` makes the Cancel a link;
 * a form that must run code first passes `cancel` (a `Button variant="secondary"`) instead.
 */
export function FormActions({
  cancelHref,
  cancel,
  className,
  children,
}: {
  cancelHref?: string;
  cancel?: ReactNode;
  className?: string;
  /** The primary action (and any other submit button), in the order they should read. */
  children: ReactNode;
}) {
  return (
    <ControlRow className={cn("sm:justify-end", className)}>
      {cancel ?? (cancelHref ? <SecondaryLink href={cancelHref}>Cancel</SecondaryLink> : null)}
      {children}
    </ControlRow>
  );
}
