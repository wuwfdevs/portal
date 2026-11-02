/**
 * Money and rounding, shared by Bookings' rate model and the tools that
 * display its figures. SQL never computes a price (docs/bookings-design.md),
 * so these are the only rounding rules.
 */

export const RATE_CARD_STEP = 25;

/** Round to cents. The EPSILON nudge keeps 154.505 from landing on 154.50. */
export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Round to a number of decimal places (0 is a whole number); the same EPSILON nudge as {@link roundCents}. */
export function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** The card's own rounding: up to the next multiple of `step` (a figure already on a step stays). */
export function roundUpTo(value: number, step = RATE_CARD_STEP): number {
  if (step <= 0) throw new Error("step must be positive");
  const cents = Math.round((value + Number.EPSILON) * 100);
  const stepCents = Math.round(step * 100);
  return (Math.ceil(cents / stepCents) * stepCents) / 100;
}

/** Dollars, the way the card prints them: "$1,150" or "$46.17" when cents matter. */
export function formatDollars(value: number, options: { cents?: boolean } = {}): string {
  const cents = options.cents ?? !Number.isInteger(roundCents(value));
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(value);
}

/** A share such as 0.35 as "35%"; 0.0671 as "6.71%". */
export function formatShare(value: number): string {
  const percent = roundCents(value * 100);
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2).replace(/0$/, "")}%`;
}
