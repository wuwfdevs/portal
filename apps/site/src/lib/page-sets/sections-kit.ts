// What a migration that moves a coded page into sections needs to build one: the shapes, and the small helpers that keep a mapper short.
// Pure. Shared by `lib/sponsorship/to-sections.ts` (phase 3) and `lib/giving/to-sections.ts` (phase 4). Nothing here is copy.

export type Tone = 'plain' | 'grey' | 'accent' | 'dark' | 'teal' | 'lime' | 'softlime'
export type SectionDoc = { id: string; blockType: string; hidden: boolean; tone: Tone } & Record<string, unknown>

/** One page ready to be written: its address, its words for the set's navigation and the sections in order. */
export interface PageRecord {
  slug: string
  path: string
  title: string
  navLabel: string
  navOrder: number
  description: string
  sections: SectionDoc[]
  /** Page-level switches (the thank-you page asks not to be listed and sends no referrer). */
  noindex?: boolean
  noReferrer?: boolean
}

/** A trimmed string, or undefined when it is empty. */
export const t = (s: string | null | undefined): string | undefined => (s?.trim() ? s.trim() : undefined)

/** An object without its empty values (undefined, null, ''), so a block never stores an empty field. */
export const clean = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')) as T

/** A section an editor had switched off on the old page (`show: false`). */
export const off = (s: { show?: boolean | null } | null | undefined): boolean => s?.show === false

type Heading = { eyebrow?: string | null; title?: string | null; body?: string | null }
/** The `heading` group of a block from an old section's eyebrow, title and body (its intro). Nothing when all three are empty. */
export const headingOf = (h: Heading | null | undefined) => {
  const heading = clean({ eyebrow: t(h?.eyebrow), title: t(h?.title), intro: t(h?.body) })
  return Object.keys(heading).length > 0 ? { heading } : {}
}

/** A page being built: sections added one at a time, each with an id that starts with the page's own prefix. */
export class SectionsPage {
  sections: SectionDoc[] = []
  constructor(private readonly idPrefix: string) {}
  add(name: string, blockType: string, tone: Tone, fields: Record<string, unknown>, opts: { anchor?: string; hidden?: boolean; variant?: string } = {}): void {
    this.sections.push({
      id: `${this.idPrefix}-${name}`,
      blockType,
      hidden: opts.hidden ?? false,
      tone,
      ...(opts.anchor ? { anchor: opts.anchor } : {}),
      ...(opts.variant ? { variant: opts.variant } : {}),
      ...clean(fields),
    })
  }
}
