// Sponsorship money. Pure. Amounts are whole cents so a 5% or 20% discount never drifts by a float.

/** "$2,145", "$41.25", "$1,566.50": whole dollars drop the cents, anything else keeps two places. */
export function formatMoney(cents: number): string {
  const whole = cents % 100 === 0
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

/** A percentage off an amount, rounded to the nearest cent. */
export function percentOff(cents: number, percent: number): number {
  return Math.round((cents * (100 - percent)) / 100)
}
