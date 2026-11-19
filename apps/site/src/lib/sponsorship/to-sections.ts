// The six sponsorship pages as sections (PAGE-BLOCKS.md, phase 3). Pure: the Sponsorship global as it stands in, the six page records out.
// Used once, by the migration that moves the pages (`20261119_050400_sponsor_pages`), and by its test, which checks that no word on the old pages
// is lost on the way. Nothing here is copy: every sentence is read from the global; only the arrangement (which block, which tone) is chosen here.

import type { Sponsorship } from '@/payload-types'

import { fill } from '@/lib/page-content'

import { formatMoney } from './money'
import { INQUIRE_HREF, SPONSOR_PATHS, type SponsorPage } from './paths'
import { openPrograms, summaryOf } from './programs'
import { toCents } from './rates'

type Tone = 'plain' | 'grey' | 'accent' | 'dark' | 'teal' | 'lime'
export type SectionDoc = { id: string; blockType: string; hidden: boolean; tone: Tone } & Record<string, unknown>
export interface PageRecord {
  slug: string
  path: string
  title: string
  navLabel: string
  navOrder: number
  description: string
  sections: SectionDoc[]
}

const t = (s: string | null | undefined): string | undefined => (s?.trim() ? s.trim() : undefined)
const clean = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')) as T
type Shown = { show?: boolean | null } | null | undefined
const off = (s: Shown): boolean => s?.show === false

type Heading = { eyebrow?: string | null; title?: string | null; body?: string | null }
const headingOf = (h: Heading | null | undefined) => {
  const heading = clean({ eyebrow: t(h?.eyebrow), title: t(h?.title), intro: t(h?.body) })
  return Object.keys(heading).length > 0 ? { heading } : {}
}

type Stat = { value?: string | null; text?: string | null; compare?: string | null }
const statRows = (rows: readonly Stat[] | null | undefined) =>
  (rows ?? []).filter((r) => t(r.value) && t(r.text)).map((r) => clean({ value: t(r.value), text: t(r.text), compare: t(r.compare) }))

const DEFAULT_NAV: Record<SponsorPage, string> = { hub: 'Sponsor WUWF', onAir: 'On air', digital: 'Digital', events: 'Events and programs', audience: 'Audience', guidelines: 'Credit guidelines' }
const SLUGS: Record<SponsorPage, string> = { hub: 'sponsor', onAir: 'sponsor-on-air', digital: 'sponsor-digital', events: 'sponsor-events', audience: 'sponsor-audience', guidelines: 'sponsor-credit-guidelines' }
const ORDER: SponsorPage[] = ['hub', 'onAir', 'digital', 'events', 'audience', 'guidelines']

class Page {
  sections: SectionDoc[] = []
  constructor(private readonly key: SponsorPage) {}
  add(name: string, blockType: string, tone: Tone, fields: Record<string, unknown>, opts: { anchor?: string; hidden?: boolean; variant?: string } = {}): void {
    this.sections.push({
      id: `${SLUGS[this.key]}-${name}`,
      blockType,
      hidden: opts.hidden ?? false,
      tone,
      ...(opts.anchor ? { anchor: opts.anchor } : {}),
      ...(opts.variant ? { variant: opts.variant } : {}),
      ...clean(fields),
    })
  }
}

type Hero = { eyebrow?: string | null; title?: string | null; body?: string | null; linkLabel?: string | null; linkHref?: string | null }
const heroActions = (hero: Hero | null | undefined, extra: Array<{ label?: string; href: string }> = []) =>
  [...(t(hero?.linkLabel) && t(hero?.linkHref) ? [{ label: t(hero?.linkLabel)!, href: t(hero?.linkHref)! }] : []), ...extra].filter((a) => a.label).slice(0, 2)

const addHero = (page: Page, hero: Hero | null | undefined, actions = heroActions(hero), extra: Record<string, unknown> = {}, tone: Tone = 'accent') =>
  page.add('hero', 'sectionFeature', tone, { label: t(hero?.eyebrow), headline: t(hero?.title), line: t(hero?.body), actions, ...extra }, { variant: 'hero' })

type Closing = { title?: string | null; text?: string | null; label?: string | null }
const addClosing = (page: Page, c: Closing | null | undefined) => {
  if (!t(c?.title)) return
  page.add('closing', 'sectionClosingBand', 'teal', { heading: clean({ title: t(c?.title), intro: t(c?.text) }), actions: t(c?.label) ? [{ label: t(c?.label)!, href: INQUIRE_HREF }] : [] })
}

type Row = { heading?: string | null; text?: string | null }
const cardRows = (rows: readonly Row[] | null | undefined) => (rows ?? []).filter((r) => t(r.heading)).map((r) => clean({ title: t(r.heading), text: t(r.text) }))

type Placement = { name?: string | null; detail?: string | null; size?: string | null; price?: string | null }
const placementTable = (rows: readonly Placement[] | null | undefined) => {
  const list = (rows ?? []).filter((r) => t(r.name))
  const withSize = list.some((r) => t(r.size))
  return {
    columns: withSize ? ['Placement', 'Size', 'Rate'] : ['Placement', 'Rate'],
    rows: list.map((r) => ({ cells: [[t(r.name), t(r.detail)].filter(Boolean).join(' — '), ...(withSize ? [t(r.size) ?? '–'] : []), t(r.price) ?? '–'] })),
  }
}

const TONE_DOWN = 'grey' as const

/** The six pages, in order, from the Sponsorship global. Sections an editor had switched off stay, hidden. */
export function sponsorPagesFromGlobal(g: Sponsorship): PageRecord[] {
  const nav = g.nav
  const pages: Record<SponsorPage, Page> = { hub: new Page('hub'), onAir: new Page('onAir'), digital: new Page('digital'), events: new Page('events'), audience: new Page('audience'), guidelines: new Page('guidelines') }
  const navName = (k: SponsorPage) => t(nav?.[k]) ?? DEFAULT_NAV[k]
  const programs = openPrograms(g.programs)

  // ------------------------------------------------------------------ the hub (board 16)
  {
    const p = pages.hub
    const h = g.hub
    const heroStats = statRows(h?.heroStats)
    addHero(
      p,
      h?.hero,
      [
        ...(t(h?.hero?.primaryLabel) ? [{ label: t(h?.hero?.primaryLabel), href: INQUIRE_HREF }] : []),
        ...(t(h?.hero?.secondaryLabel) && !off(h?.places) ? [{ label: t(h?.hero?.secondaryLabel), href: '#places' }] : []),
      ].slice(0, 2) as Array<{ label: string; href: string }>,
      heroStats.length > 0 ? { aside: 'figures', figures: heroStats.map((f) => ({ value: f.value, text: f.text })), asideNote: t(h?.heroSource) } : {},
      'dark',
    )
    if (h?.notAnAd) {
      const n = h.notAnAd
      p.add('not-an-ad', 'sectionCards', 'plain', { ...headingOf(n), cards: cardRows(n.items), note: t(n.source), placement: 'side', moreLabel: t(n.linkLabel), moreHref: t(n.linkLabel) ? SPONSOR_PATHS.guidelines : undefined }, { hidden: off(n) })
    }
    if (h?.goals) {
      const gl = h.goals
      const lineRows = (rows: ReadonlyArray<{ channel?: string | null; what?: string | null; detail?: string | null; price?: string | null }> | null | undefined) =>
        (rows ?? []).filter((l) => t(l.what)).map((l) => clean({ label: t(l.channel), name: t(l.what), detail: t(l.detail), price: t(l.price) }))
      const options = (gl.items ?? []).filter((i) => t(i.name)).map((i) =>
        clean({
          label: t(i.name),
          title: t(i.title) ?? t(i.name),
          lead: t(i.lead),
          totalLabel: t(gl.looksLikeLabel),
          total: t(i.total),
          span: t(i.span),
          lines: lineRows(i.lines),
          linkLabel: t(gl.ctaLabel),
          linkHref: t(gl.ctaLabel) ? INQUIRE_HREF : undefined,
        }),
      )
      // The last goal was built from the programs open at the time; it is typed from them now (a Picker panel is words).
      const eg = gl.eventsGoal
      if (t(eg?.name) && programs.length > 0) {
        options.push(
          clean({
            label: t(eg?.name),
            title: t(eg?.title) ?? t(eg?.name),
            lead: t(eg?.lead),
            totalLabel: t(gl.looksLikeLabel),
            total: t(eg?.total),
            span: t(eg?.span),
            lines: programs.map((pr) => clean({ label: 'Events and programs', name: pr.name, detail: summaryOf(pr.description), price: t(eg?.linePrice) })),
            linkLabel: t(gl.ctaLabel),
            linkHref: t(gl.ctaLabel) ? INQUIRE_HREF : undefined,
          }),
        )
      }
      p.add('goals', 'sectionPicker', TONE_DOWN, { ...headingOf(gl), options }, { hidden: off(gl) })
    }
    if (h?.places) {
      const pl = h.places
      p.add(
        'places',
        'sectionCards',
        'plain',
        {
          ...headingOf(pl),
          cards: (pl.items ?? []).filter((i) => t(i.title)).map((i) => {
            const key = (i.page ?? 'onAir') as SponsorPage
            return clean({ title: t(i.title), text: [t(i.body), t(i.detail)].filter(Boolean).join(' '), price: t(i.price), href: SPONSOR_PATHS[key] })
          }),
        },
        { anchor: 'places', hidden: off(pl) },
      )
      if (t(pl.noteTitle)) p.add('places-note', 'sectionCallout', 'plain', { title: t(pl.noteTitle), text: t(pl.noteText) ?? t(pl.noteTitle), moreLabel: t(pl.noteLinkLabel), moreHref: t(pl.noteLinkLabel) ? `${SPONSOR_PATHS.onAir}#packages` : undefined }, { variant: 'tint', hidden: off(pl) })
    }
    if (h?.why) p.add('why', 'sectionStats', 'plain', { ...headingOf(h.why), placement: 'side', stats: statRows(h.why.stats), source: t(h.why.source), moreLabel: t(h.why.linkLabel), moreHref: t(h.why.linkLabel) ? SPONSOR_PATHS.audience : undefined }, { variant: 'tiles', hidden: off(h.why) || !t(h.why.source) })
    if (h?.who) p.add('who', 'sectionStats', 'plain', { ...headingOf(h.who), stats: statRows(h.who.stats), source: t(h.who.source), moreLabel: t(h.who.linkLabel), moreHref: t(h.who.linkLabel) ? SPONSOR_PATHS.audience : undefined }, { variant: 'tiles', hidden: off(h.who) || !t(h.who.source) })
    if (h?.testimonials) p.add('testimonials', 'sectionQuotes', TONE_DOWN, { ...headingOf(h.testimonials), quotes: (h.testimonials.items ?? []).filter((i) => t(i.quote)).map((i) => clean({ quote: t(i.quote), name: t(i.name), role: t(i.role) })) }, { anchor: 'testimonials', hidden: off(h.testimonials) })
    if (h?.faq) p.add('faq', 'sectionQuestions', TONE_DOWN, { ...headingOf(h.faq), placement: 'side', items: (h.faq.items ?? []).filter((i) => t(i.question) && t(i.answer)).map((i) => clean({ question: t(i.question), answer: t(i.answer), linkLabel: t(i.linkLabel), linkHref: t(i.linkHref) })) }, { hidden: off(h.faq) })
    const q = h?.inquiry
    if (q) {
      const l = q.labels
      p.add(
        'inquire',
        'sectionInquiryForm',
        'plain',
        {
          ...headingOf(q),
          contactTitle: t(q.contactTitle),
          submitLabel: t(q.submitLabel),
          sendingLabel: t(q.sendingLabel),
          guidelinesNote: t(q.guidelinesNote),
          guidelinesLink: t(q.guidelinesLink),
          labels: clean({ name: t(l?.name), organization: t(l?.organization), email: t(l?.email), phone: t(l?.phone), interests: t(l?.interests), budget: t(l?.budget), message: t(l?.message), required: t(l?.required) }),
          thanksTitle: t(q.thanksTitle),
          thanksPrefix: t(q.thanksPrefix),
        },
        { anchor: 'inquire' },
      )
    }
  }

  // ------------------------------------------------------------------ on air (board 17)
  {
    const p = pages.onAir
    const a = g.onAir
    addHero(p, a?.hero, heroActions(a?.hero), t(a?.hero?.quote) ? { aside: 'quote', asideLabel: t(a?.hero?.quoteLabel), asideText: `“${t(a?.hero?.quote)}”`, asideNote: t(a?.hero?.quoteNote) } : {})
    if (a?.credit) {
      const c = a.credit
      p.add(
        'credit',
        'sectionCards',
        'plain',
        { ...headingOf(c), cards: [clean({ title: t(c.includesTitle), text: t(c.includesText) }), clean({ title: t(c.leavesTitle), text: t(c.leavesText) })].filter((x) => x.title), moreLabel: t(c.linkLabel), moreHref: t(c.linkLabel) ? t(a.hero?.linkHref) : undefined },
        { hidden: off(c) },
      )
    }
    if (a?.buy) p.add('buy', 'sectionCards', TONE_DOWN, { ...headingOf(a.buy), cards: (a.buy.items ?? []).filter((i) => t(i.title)).map((i) => clean({ title: t(i.title), text: t(i.text), price: t(i.price), href: `#${i.anchor ?? 'rates'}` })) }, { hidden: off(a.buy) })
    if (a?.rates) {
      const r = a.rates
      p.add('rates', 'sectionRateEstimator', 'plain', { ...headingOf(r), note: t(r.note), estimatorEyebrow: t(r.estimatorEyebrow), estimatorTitle: t(r.estimatorTitle), commitmentLabel: t(r.commitmentLabel), creditsLabel: t(r.creditsLabel), estimatorDisclaimer: t(r.estimatorDisclaimer), estimatorCta: t(r.estimatorCta) }, { anchor: 'rates', hidden: off(r) })
    }
    if (t(a?.sharing?.title)) p.add('sharing', 'sectionCallout', 'plain', { title: t(a?.sharing?.title), text: t(a?.sharing?.text) ?? t(a?.sharing?.title) }, { variant: 'tint', hidden: off(a?.rates) })
    if (a?.carpool) {
      const c = a.carpool
      p.add('carpool', 'sectionCarpool', TONE_DOWN, { ...headingOf(c), perDayNote: t(c.perDayNote), slotsNote: t(c.slotsNote), actions: t(c.ctaLabel) ? [{ label: t(c.ctaLabel)!, href: INQUIRE_HREF }] : [] }, { anchor: 'carpool', hidden: off(c) })
    }
    if (a?.programs) {
      const pr = a.programs
      const names = (pr.names ?? []).filter((n) => t(n.name)).map((n) => ({ text: t(n.name)! }))
      const intro = [t(pr.body), t(pr.chooseLabel)].filter(Boolean).join('\n\n')
      p.add('programs', 'sectionCheckList', 'plain', { heading: clean({ eyebrow: t(pr.eyebrow), title: t(pr.title), intro: t(intro) }), mark: 'dot', items: names }, { anchor: 'programs', hidden: off(pr) })
    }
    if (a?.packages) {
      const k = a.packages
      p.add('packages', 'sectionPackages', TONE_DOWN, { ...headingOf(k), packageLabel: t(k.packageLabel), note: t(k.note) }, { anchor: 'packages', hidden: off(k) })
    }
    if (a?.pay) {
      const y = a.pay
      const lines = (y.items ?? []).filter((i) => t(i.heading) || t(i.text)).map((i) => ({ text: [t(i.heading), t(i.text)].filter(Boolean).join(' ') }))
      if (lines.length > 0) p.add('pay', 'sectionCheckList', 'teal', { mark: 'dot', items: lines }, { hidden: off(y) })
      if (t(y.ctaTitle)) p.add('pay-cta', 'sectionClosingBand', 'teal', { heading: clean({ title: t(y.ctaTitle), intro: t(y.ctaText) }), actions: t(y.ctaLabel) ? [{ label: t(y.ctaLabel)!, href: INQUIRE_HREF }] : [] }, { hidden: off(y) })
    }
  }

  // ------------------------------------------------------------------ digital (board 18)
  {
    const p = pages.digital
    const d = g.digital
    addHero(p, d?.hero)
    if (d?.website) p.add('website', 'sectionTable', 'plain', { ...headingOf(d.website), ...placementTable(d.website.placements) }, { hidden: off(d.website) })
    if (d?.app) p.add('app', 'sectionTable', TONE_DOWN, { ...headingOf(d.app), ...placementTable(d.app.placements) }, { hidden: off(d.app) })
    if (d?.newsletter) p.add('newsletter', 'sectionTable', 'plain', { ...headingOf(d.newsletter), ...placementTable(d.newsletter.placements) }, { hidden: off(d.newsletter) })
    if (d?.package) {
      const k = d.package
      const price = typeof k.price === 'number' && t(k.priceSuffix) ? true : undefined
      p.add(
        'package',
        'sectionFeature',
        'lime',
        { label: t(k.eyebrow), headline: t(k.title), line: t(k.body), ...(price ? { aside: 'figures', figures: [{ value: formatMoney(toCents(k.price)), text: t(k.priceSuffix) ?? '' }].filter((f) => f.text) } : {}) },
        { variant: 'split', hidden: off(k) },
      )
    }
    if (d?.rules) p.add('rules', 'sectionCards', 'plain', { ...headingOf(d.rules), cards: cardRows(d.rules.items) }, { hidden: off(d.rules) })
    addClosing(p, d?.closing)
  }

  // ------------------------------------------------------------------ events and programs (board 19)
  {
    const p = pages.events
    const e = g.events
    addHero(p, e?.hero)
    if (e?.showUp) p.add('show-up', 'sectionStats', 'plain', { heading: clean({ title: t(e.showUp.title) }), stats: statRows(e.showUp.stats), source: t(e.showUp.source), moreLabel: t(e.showUp.linkLabel), moreHref: t(e.showUp.linkLabel) ? SPONSOR_PATHS.audience : undefined }, { variant: 'tiles', hidden: off(e.showUp) || !t(e.showUp.source) })
    if (e?.open) {
      const o = e.open
      p.add('open', 'sectionOpenPrograms', 'plain', { heading: clean({ eyebrow: t(o.eyebrow), title: t(o.titleMany) }), titleOne: t(o.titleOne), titleTwo: t(o.titleTwo), emptyText: t(o.emptyText), talkLabel: t(o.talkLabel), moreLabel: t(o.moreLabel), levelsLabel: t(o.levelsLabel), recognitionLabel: t(o.recognitionLabel) })
    }
    if (e?.every) p.add('every', 'sectionCards', TONE_DOWN, { heading: clean({ eyebrow: t(e.every.eyebrow), title: t(e.every.title) }), cards: cardRows(e.every.items), note: t(e.every.note) }, { hidden: off(e.every) })
    addClosing(p, e?.closing)
  }

  // ------------------------------------------------------------------ audience (board 20)
  {
    const p = pages.audience
    const a = g.audience
    addHero(p, a?.hero)
    if (a?.wuwf) p.add('wuwf', 'sectionStats', 'plain', { ...headingOf(a.wuwf), stats: statRows(a.wuwf.stats), source: t(a.wuwf.source) }, { variant: 'tiles', hidden: off(a.wuwf) || !t(a.wuwf.source) })
    if (a?.small) {
      const s = a.small
      p.add('small', 'sectionStats', TONE_DOWN, { ...headingOf(s), stats: statRows(s.stats), source: t(s.source) }, { variant: 'tiles', hidden: off(s) || !t(s.source) })
      if (statRows(s.skeptical).length > 0) p.add('skeptical', 'sectionStats', TONE_DOWN, { heading: clean({ title: t(s.skepticalTitle) }), stats: statRows(s.skeptical), source: t(s.source) }, { variant: 'tiles', hidden: off(s) || !t(s.source) })
    }
    if (a?.halo) {
      const h = a.halo
      p.add('halo', 'sectionStats', 'plain', { ...headingOf(h), stats: statRows(h.stats), source: t(h.source) }, { variant: 'tiles', hidden: off(h) || !t(h.source) })
      const cmp = (h.comparison ?? []).filter((c) => t(c.label) && typeof c.npr === 'number')
      if (cmp.length > 0) p.add('halo-compare', 'sectionStats', 'plain', { heading: clean({ title: t(h.compareTitle) }), stats: cmp.map((c) => clean({ value: `${c.npr}%`, text: t(c.label), compare: typeof c.commercial === 'number' ? `${c.commercial}%` : undefined })), valueLabel: t(h.nprLabel), compareLabel: t(h.commercialLabel), source: t(h.source) }, { variant: 'compare', hidden: off(h) || !t(h.source) })
      if (t(h.caveat)) p.add('halo-caveat', 'sectionCallout', 'plain', { text: t(h.caveat) }, { variant: 'tint', hidden: off(h) })
    }
    if (a?.national) {
      const n = a.national
      p.add('national', 'sectionStats', TONE_DOWN, { ...headingOf(n), stats: statRows(n.stats), source: t(n.source) }, { variant: 'tiles', hidden: off(n) || !t(n.source) })
      if (statRows(n.glance).length > 0) p.add('glance', 'sectionStats', TONE_DOWN, { heading: clean({ title: t(n.glanceTitle) }), stats: statRows(n.glance), source: t(n.glanceSource) }, { variant: 'tiles', hidden: off(n) || !t(n.glanceSource) })
    }
    if (a?.sectors) {
      const s = a.sectors
      const sectorLines = (label: string | null | undefined, rows: readonly Stat[] | null | undefined) => statRows(rows).map((st) => clean({ label: t(label), name: st.text, price: st.value }))
      const options = (s.items ?? []).filter((i) => t(i.name)).map((i) =>
        clean({
          label: t(i.name),
          title: t(i.title) ?? t(i.name),
          lead: t(i.lead),
          lines: [...sectorLines(s.localLabel, i.local), ...sectorLines(s.nationalLabel, i.national)],
          linkLabel: t(s.talkLabel) ? fill(s.talkLabel, { short: t(i.short) ?? t(i.name)! }) : undefined,
          linkHref: t(s.talkLabel) ? INQUIRE_HREF : undefined,
        }),
      )
      p.add('sectors', 'sectionPicker', 'plain', { ...headingOf(s), options }, { hidden: off(s) })
      if (t(s.source)) p.add('sectors-source', 'sectionCallout', 'plain', { text: t(s.source) }, { variant: 'tint', hidden: off(s) })
    }
    addClosing(p, a?.closing)
  }

  // ------------------------------------------------------------------ credit guidelines (board 20b)
  {
    const p = pages.guidelines
    const gd = g.guidelines
    addHero(p, gd?.hero)
    const inc = gd?.includes
    const lv = gd?.leavesOut
    const incItems = (inc?.items ?? []).filter((i) => t(i.text)).map((i) => ({ text: t(i.text)! }))
    const lvItems = (lv?.items ?? []).filter((i) => t(i.heading)).map((i) => clean({ text: t(i.heading), detail: t(i.examples) }))
    if (inc || lv) {
      p.add(
        'includes',
        'sectionCheckList',
        'plain',
        {
          heading: clean({ eyebrow: t(inc?.eyebrow) ?? t(lv?.eyebrow) }),
          listTitle: t(inc?.title),
          mark: 'check',
          items: incItems,
          second: lvItems.length > 0 ? clean({ title: t(lv?.title), mark: 'cross', items: lvItems }) : undefined,
        },
        { anchor: 'includes', hidden: off(inc) && off(lv) },
      )
    }
    if (gd?.side) {
      const s = gd.side
      p.add('side', 'sectionTable', 'plain', { ...headingOf(s), columns: [t(s.adLabel) ?? 'An ad', t(s.creditLabel) ?? 'A credit'], rows: (s.pairs ?? []).filter((r) => t(r.ad) || t(r.credit)).map((r) => ({ cells: [t(r.ad) ?? '–', t(r.credit) ?? '–'] })) }, { hidden: off(s) })
    }
    if (gd?.rules) p.add('rules', 'sectionCards', TONE_DOWN, { heading: clean({ eyebrow: t(gd.rules.eyebrow), title: t(gd.rules.title) }), cards: cardRows(gd.rules.items), note: t(gd.rules.source) }, { hidden: off(gd.rules) })
    addClosing(p, gd?.closing)
  }

  return ORDER.map((k, i) => {
    const hero = (k === 'hub' ? g.hub?.hero : k === 'onAir' ? g.onAir?.hero : k === 'digital' ? g.digital?.hero : k === 'events' ? g.events?.hero : k === 'audience' ? g.audience?.hero : g.guidelines?.hero) ?? null
    return {
      slug: SLUGS[k],
      path: SPONSOR_PATHS[k],
      title: t(hero?.title) ?? navName(k),
      navLabel: navName(k),
      navOrder: i + 1,
      description: t(hero?.body?.split(/\n\s*\n/)[0]) ?? '',
      sections: pages[k].sections,
    }
  })
}
