// Display formatting for the public site. The station is in Pensacola, so dates are shown in Central time
// whatever the server's or the reader's clock says.

const STATION_TIME_ZONE = 'America/Chicago'

/** "Oct 28, 2026" */
export function formatLongDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: STATION_TIME_ZONE }).format(date)
}

/** "LO" for "Leigh Ostrander": the first letters of the first two words. */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}
