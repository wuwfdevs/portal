import { Button } from "@/components/ui/button";
import { ControlRow } from "@/components/ui/control-row";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { SecondaryLink } from "@/components/ui/primary-link";
import { cn } from "@/lib/cn";

/**
 * Day navigation for a screen that shows one day (On Air's Today, the DAD log): Prev day, a date
 * field, Next day, and Go (docs/ui-patterns.md, "Day navigation"). The arrows are squares either side
 * of the field on a phone and labelled links from `sm` up. Go sits to the right of Next day, outside the
 * field's form and tied to it with `form=`, so the order reads ‹ date › Go on both. The form is a plain
 * GET to the current page with `date`, so it works before hydration; Enter in the field submits too.
 */
export function DateStepper({
  date,
  prevHref,
  nextHref,
  id = "jump-date",
  className,
}: {
  /** The day shown, as `YYYY-MM-DD`. */
  date: string;
  prevHref: string;
  nextHref: string;
  /** The field's id; give a screen's second stepper (there is rarely one) its own. */
  id?: string;
  className?: string;
}) {
  const formId = `${id}-form`;
  return (
    <ControlRow className={cn("sm:flex-nowrap", className)}>
      <SecondaryLink size="sm" href={prevHref} phoneIcon={<ChevronLeftIcon className="size-4" />}>
        ← Prev day
      </SecondaryLink>
      <form id={formId} method="get" className="max-sm:flex-1" data-row="grow">
        <Input
          id={id}
          type="date"
          name="date"
          aria-label="Jump to date"
          defaultValue={date}
          className="w-40 max-sm:w-full max-sm:min-w-0"
        />
      </form>
      <SecondaryLink size="sm" href={nextHref} phoneIcon={<ChevronRightIcon className="size-4" />}>
        Next day →
      </SecondaryLink>
      <Button type="submit" form={formId} variant="secondary" row="fixed" className="shrink-0">
        Go
      </Button>
    </ControlRow>
  );
}
