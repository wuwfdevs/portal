// Unearthing Florida's pages, as sections (hubs redesign, 2026-11-23; PAGE-BLOCKS.md phase 6): the show's home page and its About page, built from the words the coded hub held (the
// hub's dateline and "About the project", the production's title and summary, the collections that have episodes) and from the design canvas's own copy. Pure: facts in, page specs out;
// the migration `unearthing_home_page` writes them. Nothing is typed that the database does not hold or the canvas does not say: a bracketed line on the canvas is a review note and
// never prints, a count on the canvas is a stand-in and is never typed into a page (a count that is typed goes stale), and a page that has no words for a section leaves the section out.

import { lexicalFromPlain } from '@/lib/events/stored'

export interface UnearthingFacts {
  /** The production's title and summary. */
  title: string
  summary: string | null
  /** The old hub's small line above the title, and its "About the project" box. */
  dateline: string | null
  about: string | null
  /** The collections (series) that have a published episode of the show, in the order to show. */
  collections: Array<{ title: string; slug: string; summary: string | null }>
  /** The show's own address: `/shows/<slug>`. */
  showPath: string
}

export interface PageSpec {
  slug: string
  title: string
  /** An address of its own; the show's home has none (the show's address is its address). */
  path: string | null
  isShowHome: boolean
  navHidden: boolean
  navLabel: string | null
  navOrder: number
  description: string | null
  sections: Array<Record<string, unknown>>
}

const clean = (v: string | null | undefined): string | null => (v && v.trim() !== '' ? v.trim() : null)

/** The home page and, when the old hub had "About the project" words, an About page. */
export function unearthingPages(f: UnearthingFacts): PageSpec[] {
  const dateline = clean(f.dateline)
  const summary = clean(f.summary)
  const about = clean(f.about)
  const sections: Array<Record<string, unknown>> = []
  const at = (anchor: string) => `${anchor}`

  sections.push({
    id: 'uf-lead',
    blockType: 'sectionFeature',
    hidden: false,
    tone: 'plain',
    variant: 'hero',
    ...(dateline ? { label: dateline } : {}),
    headline: f.title,
    ...(summary ? { line: summary } : {}),
    playLatest: true,
    playLatestLabel: 'Play the latest',
    actions: [{ label: 'Explore the map of sites', href: '#explore', style: 'outline' }],
  })
  sections.push({
    id: 'uf-new',
    blockType: 'sectionList',
    hidden: false,
    tone: 'plain',
    variant: 'grid',
    anchor: at('episodes'),
    navLabel: 'Episodes',
    source: 'episodes',
    count: 3,
    heading: { title: 'New this month' },
  })
  sections.push({
    id: 'uf-explore',
    blockType: 'sectionExplore',
    hidden: false,
    tone: 'grey',
    anchor: at('explore'),
    navLabel: 'Explore',
    heading: { eyebrow: 'Explore', title: 'Every site, by place and by time' },
  })
  if (f.collections.length > 0) {
    sections.push({
      id: 'uf-collections',
      blockType: 'sectionCards',
      hidden: false,
      tone: 'plain',
      anchor: at('collections'),
      navLabel: 'Collections',
      heading: { title: 'Collections' },
      cards: f.collections.map((c) => ({ title: c.title, tag: 'Collection', ...(clean(c.summary) ? { text: clean(c.summary) } : {}), href: `/series/${c.slug}`, linkLabel: 'Browse the collection' })),
    })
  }
  sections.push({
    id: 'uf-support',
    blockType: 'sectionSupport',
    hidden: false,
    tone: 'grey',
    heading: { eyebrow: 'Support Unearthing Florida', title: 'Help dig up the next story' },
    label: 'Give to Unearthing Florida',
    note: 'Opens WUWF\'s donation form.',
  })

  const pages: PageSpec[] = [
    { slug: 'unearthing-florida-home', title: f.title, path: null, isShowHome: true, navHidden: true, navLabel: null, navOrder: 1, description: summary, sections },
  ]
  if (about) {
    pages.push({
      slug: 'unearthing-florida-about',
      title: 'About',
      path: `${f.showPath}/about`,
      isShowHome: false,
      navHidden: false,
      navLabel: 'About',
      navOrder: 2,
      description: null,
      sections: [{ id: 'uf-about', blockType: 'sectionText', hidden: false, tone: 'plain', heading: { eyebrow: f.title, title: 'About the project' }, body: lexicalFromPlain(about) }],
    })
  }
  return pages
}
