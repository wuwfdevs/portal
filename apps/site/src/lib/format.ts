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

/** "4:07" or "1:02:09" from a length in seconds. Empty for nothing, zero, a negative or nonsense. */
export function formatDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return ''
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
