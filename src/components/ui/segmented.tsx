import Link from "next/link";
import { cn } from "@/lib/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A short radio group drawn as one segmented bar — for a rule with a few
 * named settings (a time rule, a service level). Native radios via
 * `peer-checked`, controlled or uncontrolled like ChoiceCards.
 */
export function Segmented<T extends string>({
  name,
  options,
  value,
  defaultValue,
  onChange,
  className,
}: {
  name: string;
  options: SegmentedOption<T>[];
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      className={cn(
        "inline-flex max-w-full flex-wrap overflow-hidden rounded border border-line",
        className,
      )}
    >
      {options.map((option) => (
        <label key={option.value} className="relative block cursor-pointer">
          <input
            type="radio"
            name={name}
            value={option.value}
            className="peer sr-only"
            checked={value !== undefined ? value === option.value : undefined}
            defaultChecked={value === undefined ? defaultValue === option.value : undefined}
            onChange={onChange ? () => onChange(option.value) : undefined}
          />
          <span className="inline-flex h-9 items-center border-r border-line bg-white px-3.5 text-[13px] font-semibold text-ink-700 last:border-r-0 peer-checked:bg-brand-surface peer-checked:text-brand-link peer-focus-visible:ring-2 peer-focus-visible:ring-brand-surface">
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}

export interface SegmentedLinkOption {
  label: string;
  href: string;
  active: boolean;
}

/**
 * `Segmented` as links, for a view switch that lives in the URL ("Week | Month",
 * "By line | By date"). Same bar, same fill; a switch of how the same data is
 * drawn, never a filter (that is `FilterChips`) or a page of the tool (`TabNav`).
 */
export function SegmentedLinks({
  options,
  label,
  className,
}: {
  options: SegmentedLinkOption[];
  label: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "inline-flex max-w-full flex-wrap overflow-hidden rounded border border-line",
        className,
      )}
    >
      {options.map((option) => (
        <Link
          key={option.label}
          href={option.href}
          aria-current={option.active ? "page" : undefined}
          className={cn(
            "inline-flex h-9 items-center border-r border-line px-3.5 text-[13px] font-semibold last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-surface",
            option.active
              ? "bg-brand-surface text-brand-link"
              : "bg-white text-ink-700 hover:bg-panel-50",
          )}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

/** The calendars' "Week | Month" switch (Bookings' term calendar, On Air's hours calendars). */
export function WeekMonthLinks({
  active,
  weekHref,
  monthHref,
}: {
  active: "week" | "month";
  weekHref: string;
  monthHref: string;
}) {
  return (
    <SegmentedLinks
      label="View"
      options={[
        { label: "Week", href: weekHref, active: active === "week" },
        { label: "Month", href: monthHref, active: active === "month" },
      ]}
    />
  );
}
