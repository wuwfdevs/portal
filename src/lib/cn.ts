import { extendTailwindMerge } from "tailwind-merge";
import { fontSize } from "@/lib/design-tokens";

/**
 * tailwind-merge knows Tailwind's own utilities, not this project's theme. A
 * `text-*` class it can't place is assumed to be a text colour — so without
 * this, `text-label` and `text-ink-500` in one `cn()` call were treated as
 * two colours and the size was dropped (every badge, block label and
 * uppercase caption silently inherited its parent's size). The named sizes
 * come from the token file, so a new one is covered without touching this.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: Object.keys(fontSize) }],
    },
  },
});

/**
 * Joins class name fragments, skipping falsy values, and resolves conflicting
 * Tailwind utilities (e.g. a caller's `w-40` overriding a base `w-full`) so the
 * last one wins — matching normal call-site intent. A plain string join can't
 * do this: two same-specificity classes in one `class` attribute are decided
 * by their order in the compiled stylesheet, not the order they're listed in
 * the attribute, which silently broke every Input/Select width override
 * built on `controlClasses`' default `w-full` (see components/ui/input.tsx).
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return twMerge(classes.filter(Boolean).join(" "));
}
