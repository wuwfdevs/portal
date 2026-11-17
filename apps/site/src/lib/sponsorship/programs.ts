// Events and programs open to sponsors (board 19). The records are edited in the admin (globals/Sponsorship); this is the
// pure side: what the page may show of a record. A level without a confirmed price shows "Priced on request", so nothing here
// commits WUWF to a figure. A record that is not open is held back from the page, never shown with a price.

export type ProgramKind = 'live-series' | 'festival' | 'community-program' | 'other'
export type ProgramStatus = 'open' | 'held' | 'not-yet-open'

export const PROGRAM_KINDS: readonly { value: ProgramKind; label: string }[] = [
  { value: 'live-series', label: 'Live music series' },
  { value: 'festival', label: 'Festival' },
  { value: 'community-program', label: 'Community program' },
  { value: 'other', label: 'Event or program' },
]

export const PRICED_ON_REQUEST = 'Priced on request'

type RawLevel = { name?: string | null; description?: string | null; price?: string | null; id?: string | null }
type RawProgram = {
  id?: string | null
  name?: string | null
  kind?: string | null
  description?: string | null
  levels?: RawLevel[] | null
  recognition?: string | null
  status?: string | null
  pageUrl?: string | null
}

export type ProgramLevel = { key: string; name: string; description: string; price: string }
export type ProgramView = {
  key: string
  name: string
  kindLabel: string
  description: string
  levels: ProgramLevel[]
  recognition: string
  pageUrl: string | null
}

const clean = (s: string | null | undefined): string => (s ?? '').trim()

/** Only programs that are open and have a name, with their named levels; each level's price is its own words or "Priced on request". */
export function openPrograms(raw: readonly RawProgram[] | null | undefined): ProgramView[] {
  const out: ProgramView[] = []
  for (const [i, p] of (raw ?? []).entries()) {
    const name = clean(p.name)
    if (!name || (p.status ?? 'open') !== 'open') continue
    const kind = PROGRAM_KINDS.find((k) => k.value === p.kind) ?? PROGRAM_KINDS[3]!
    const levels = (p.levels ?? [])
      .map((l, j) => ({ key: l.id ?? `${i}-${j}`, name: clean(l.name), description: clean(l.description), price: clean(l.price) || PRICED_ON_REQUEST }))
      .filter((l) => l.name !== '')
    out.push({ key: p.id ?? `${i}-${name}`, name, kindLabel: kind.label, description: clean(p.description), levels, recognition: clean(p.recognition), pageUrl: clean(p.pageUrl) || null })
  }
  return out
}

/** The first sentence of a description, for the one-line summary on the goal picker. */
export function summaryOf(description: string): string {
  const first = description.match(/^.*?[.!?](?=\s|$)/)?.[0]
  return first ?? description
}
