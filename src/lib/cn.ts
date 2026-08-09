import { twMerge } from "tailwind-merge";

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
