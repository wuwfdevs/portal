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
