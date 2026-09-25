import { cn } from "@/lib/cn";

export interface ChoiceCardOption<T extends string> {
  value: T;
  title: string;
  description?: string;
}

/**
 * A radio group rendered as cards — a title and a one-line description
 * per option — for a choice that changes what the rest of a form asks
 * (how an order sells its credits, say). Plain native radios styled through
 * `peer-checked`, so it works inside an ordinary <form action> with no
 * client JavaScript; pass `value`/`onChange` from a client component to
 * control it. Every card is a real <label>, so the whole card is the hit
 * target and Tab lands on the radio.
 */
export function ChoiceCards<T extends string>({
  name,
  options,
  value,
  defaultValue,
  onChange,
  columns = 4,
  className,
}: {
  name: string;
  options: ChoiceCardOption<T>[];
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" }[columns];
  return (
    <div className={cn("grid grid-cols-1 gap-2", grid, className)}>
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
          <span className="flex h-full flex-col gap-1 rounded border border-line bg-white px-3.5 py-3 peer-checked:border-brand-primary peer-checked:bg-[#F3F9FD] peer-checked:shadow-[inset_0_0_0_1px_#3090D0] peer-focus-visible:ring-2 peer-focus-visible:ring-brand-surface">
            <span className="text-sm font-bold text-ink-900">{option.title}</span>
            {option.description && (
              <span className="text-xs leading-snug text-ink-500">{option.description}</span>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}
