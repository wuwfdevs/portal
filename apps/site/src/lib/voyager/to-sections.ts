// The Voyager's pages, as sections (hubs redesign, slice 5; PAGE-BLOCKS.md phase 6): the hub and its About page, built from the words the coded hub held (the `voyager-hub` global: the
// tagline, the featured story, the sections, the podcast, the staff, the invitation to join, the footnote) and from the design canvas's own copy. Pure: facts in, page specs out; the
// migration `voyager_page` writes them. Nothing is typed that the database does not hold or the canvas does not say: a bracketed line on the canvas is a review note and never
// prints, and a part with no words leaves its section out.
//
// What the canvas draws that the page does not, because the canvas has only placeholders for it: the About page's "A short history", "Who does what", the editorial-independence callout and
// "Good to know" (questions). Their words do not exist yet; an editor writes them on the page. The footnote's words are carried on the About page (under "A newsroom run by students") and in the
// set's foot (Shared text → The Voyager's foot), where they print under every page of the Voyager.
//
// What the coded hub drew that the page does not: the newspaper nameplate (decided: the identity is the teal tone and a teal strip), the dateline, and a staff card's link to the person's page
// (a Profile band's roster has no link); the staff list is copied once and is edited on the page from now on.

import { lexicalFromPlain } from '@/lib/events/stored'

type Id = number | string

export interface VoyagerFacts {
  tagline: string | null
  /** The story the hub featured, if an editor chose one. Empty leads with the newest Voyager story. */
  leadId: Id | null
  /** The sections the hub listed, in order. */
  sections: Array<{ id: Id; title: string; slug: string | null }>
  /** The Voyager podcast the hub's multimedia band showed: the one show the spotlight draws. */
  showIds: Id[]
  staff: Array<{ name: string; role: string | null; photoId: Id | null }>
  join: { heading: string | null; text: string | null; href: string | null }
  footnote: string | null
}

export interface VoyagerPageSpec {
  slug: string
  title: string
  path: string
  navHidden: boolean
  navLabel: string | null
  navOrder: number
  description: string | null
  sections: Array<Record<string, unknown>>
}

const clean = (v: string | null | undefined): string | null => (v && v.trim() !== '' ? v.trim() : null)
/** A section's slug, lowercase letters, digits and hyphens, is its anchor; anything else has none (and so no strip link). */
const anchorOf = (slug: string | null): string | null => (slug && /^[a-z][a-z0-9-]*$/.test(slug) ? slug : null)

/** The closing band and the Support band, the same on both pages. */
function ending(f: VoyagerFacts, idPrefix: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  const href = clean(f.join.href)
  if (href) {
    out.push({
      id: `${idPrefix}-join`,
      blockType: 'sectionClosingBand',
      hidden: false,
      tone: 'dark',
      heading: { eyebrow: 'Join us', title: clean(f.join.heading) ?? 'Write for The Voyager', ...(clean(f.join.text) ? { intro: clean(f.join.text) } : {}) },
      actions: [{ label: 'Join the newsroom', href }],
    })
  }
  out.push({
    id: `${idPrefix}-support`,
    blockType: 'sectionSupport',
    hidden: false,
    tone: 'plain',
    heading: { eyebrow: 'Support The Voyager', title: 'Your gift supports student journalism' },
    label: 'Give to The Voyager',
    note: 'Opens WUWF\'s donation form.',
  })
  return out
}

/** The hub (`/voyager`, left out of the strip: its parts are the strip's links) and the About page (`/voyager/about`). */
export function voyagerPages(f: VoyagerFacts): { home: VoyagerPageSpec; about: VoyagerPageSpec } {
  const tagline = clean(f.tagline)
  const sections: Array<Record<string, unknown>> = []

  sections.push({
    id: 'vy-front',
    blockType: 'sectionFrontPage',
    hidden: false,
    tone: 'plain',
    anchor: 'front',
    navLabel: 'Front page',
    ...(f.leadId !== null ? { lead: f.leadId } : {}),
    topStories: [],
  })
  // One run for each section, each its own band: the first holds five stories (the lead on a row of its own), the rest three.
  f.sections.forEach((s, i) => {
    const anchor = anchorOf(s.slug)
    sections.push({
      id: `vy-news-${i + 1}`,
      blockType: 'sectionNewsRun',
      hidden: false,
      tone: i % 2 === 0 ? 'grey' : 'plain',
      // The strip's link goes to the section's own page (`/campus`), which lists all of its stories, and not to this run on the hub: the run can be empty once the lead and The Briefing have taken the
      // newest stories, and a link to a part of the page that is not drawn goes nowhere.
      ...(anchor ? { anchor, navLabel: s.title, navHref: `/${anchor}` } : {}),
      section: s.id,
      count: i === 0 ? 5 : 3,
      heading: { title: s.title },
    })
  })
  sections.push({
    id: 'vy-video',
    blockType: 'sectionList',
    hidden: false,
    tone: 'plain',
    variant: 'rail',
    anchor: 'video',
    navLabel: 'Video',
    // Reads only the Voyager's clips on this page (`PageSetSpec.stories`).
    source: 'clips',
    scope: 'latest',
    count: 8,
    heading: { title: 'Voyager video' },
  })
  if (f.showIds.length > 0) {
    sections.push({
      id: 'vy-shows',
      blockType: 'sectionShowSpotlight',
      hidden: false,
      tone: 'grey',
      anchor: 'shows',
      navLabel: 'Shows',
      onlyShows: f.showIds,
      heading: { eyebrow: 'Student-made', title: 'Voyager shows' },
    })
  }
  if (f.staff.length > 0) {
    sections.push({
      id: 'vy-staff',
      blockType: 'sectionProfileBand',
      hidden: false,
      tone: 'plain',
      variant: 'roster',
      anchor: 'staff',
      navLabel: 'Staff',
      heading: { title: 'Staff' },
      people: f.staff.map((p) => ({ name: p.name, ...(clean(p.role) ? { role: clean(p.role) } : {}), ...(p.photoId !== null ? { photo: p.photoId } : {}) })),
    })
  }
  sections.push(...ending(f, 'vy'))

  const footnote = clean(f.footnote)
  const joinHref = clean(f.join.href)
  const about: Array<Record<string, unknown>> = [
    {
      id: 'vya-lead',
      blockType: 'sectionFeature',
      hidden: false,
      tone: 'teal',
      variant: 'split',
      label: 'About The Voyager',
      headline: tagline ?? 'The student newspaper of the University of West Florida',
      actions: [{ label: 'Read the latest', href: '/voyager' }, ...(joinHref ? [{ label: 'Join the newsroom', href: joinHref }] : [])],
    },
  ]
  if (footnote) {
    about.push({ id: 'vya-what', blockType: 'sectionText', hidden: false, tone: 'plain', placement: 'side', heading: { eyebrow: 'What it is', title: 'A newsroom run by students' }, body: lexicalFromPlain(footnote) })
  }
  about.push(...ending(f, 'vya'))

  return {
    home: { slug: 'voyager', title: 'The Voyager', path: '/voyager', navHidden: true, navLabel: null, navOrder: 1, description: tagline, sections },
    about: { slug: 'voyager-about', title: 'About', path: '/voyager/about', navHidden: false, navLabel: 'About', navOrder: 2, description: null, sections: about },
  }
}
