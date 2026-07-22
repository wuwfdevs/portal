/** Joins class name fragments, skipping falsy values. No dependency needed for this. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
