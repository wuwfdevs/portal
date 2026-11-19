// The four giving pages as sections (PAGE-BLOCKS.md, phase 4). Pure: the Giving pages global as it stands in, the four page records out. Used once,
// by the migration that moves the pages (`20261119_*_giving_pages_as_sections`), and by its test, which checks that no word of the old pages is lost on
// the way. Nothing here is copy: every sentence is read from the global; only the arrangement (which block, which tone) is chosen here.
//
// The levels, amounts, addresses and contact details are not words of a page: they are the Giving settings, copied by the migration before this one.

import { paragraphs } from '@/lib/page-content'
import { SectionsPage, clean, headingOf, off, t, type PageRecord, type Tone } from '@/lib/page-sets/sections-kit'
import type { SupportPage } from '@/payload-types'

import { GIVING_PATHS, type GivingPage } from './paths'

export type { PageRecord, SectionDoc } from '@/lib/page-sets/sections-kit'

const SLUGS: Record<GivingPage, string> = { give: 'support', ways: 'support-ways', legacy: 'support-legacy', thanks: 'support-thanks' }
const DEFAULT_NAV: Record<'give' | 'legacy' | 'ways', string> = { give: 'Membership', legacy: 'Leave a legacy', ways: 'Other ways to give' }
/** The order of the strip under the header: Membership, Leave a legacy, Other ways to give (as the old strip listed them). */
const NAV_ORDER: Record<'give' | 'legacy' | 'ways', number> = { give: 1, legacy: 2, ways: 3 }

class Page extends SectionsPage {
  constructor(key: GivingPage) {
    super(SLUGS[key])
  }
}

const rows = <T extends Record<string, unknown>>(list: readonly (T | null | undefined)[] | null | undefined, keep: (r: T) => boolean, map: (r: T) => Record<string, unknown>) =>
  (list ?? []).filter((r): r is T => Boolean(r) && keep(r as T)).map((r) => clean(map(r)))

type Item = { heading?: string | null; text?: string | null }
const cardRows = (items: readonly Item[] | null | undefined) => rows(items, (r) => Boolean(t(r.heading)), (r) => ({ title: t(r.heading), text: t(r.text) }))

const lineTexts = (list: readonly { text?: string | null }[] | null | undefined): string[] => (list ?? []).map((r) => t(r?.text)).filter((x): x is string => Boolean(x))

type Faq = { show?: boolean | null; title?: string | null; items?: readonly { question?: string | null; answer?: string | null; linkLabel?: string | null; linkHref?: string | null }[] | null }
const faqSection = (page: Page, faq: Faq | null | undefined) => {
  if (!faq || (faq.items?.length ?? 0) === 0) return
  page.add(
    'faq',
    'sectionQuestions',
    'plain',
    {
      heading: clean({ title: t(faq.title) ?? 'Questions' }),
      items: rows(faq.items, (r) => Boolean(t(r.question) && t(r.answer)), (r) => ({ question: t(r.question), answer: t(r.answer), linkLabel: t(r.linkLabel), linkHref: t(r.linkHref) })),
    },
    { hidden: off(faq) },
  )
}

/** The four pages, in the order of the strip, from the Giving pages global. Sections an editor had switched off stay, hidden. */
export function givingPagesFromGlobal(g: SupportPage): PageRecord[] {
  const nav = g.nav
  const navName = (k: 'give' | 'legacy' | 'ways') => t(nav?.[k]) ?? DEFAULT_NAV[k]
  const out: PageRecord[] = []

  // ------------------------------------------------------------------ Give (board 14)
  {
    const p = new Page('give')
    const give = g.give
    const card = give?.card
    p.add(
      'hero',
      'sectionGiftCard',
      'dark',
      {
        label: t(give?.hero?.eyebrow),
        headline: t(give?.hero?.title),
        line: t(give?.hero?.body),
        assurances: lineTexts(give?.hero?.assurances).map((text) => ({ text })),
        card: clean({
          monthlyLabel: t(card?.monthlyLabel),
          monthlySub: t(card?.monthlySub),
          onceLabel: t(card?.onceLabel),
          onceSub: t(card?.onceSub),
          otherLabel: t(card?.otherLabel),
          titleMonthly: t(card?.titleMonthly),
          titleOnce: t(card?.titleOnce),
          messageOne: t(card?.messageOne),
          messageMany: t(card?.messageMany),
          anyTitle: t(card?.anyTitle),
          anyBenefits: lineTexts(card?.anyBenefits).map((text) => ({ text })),
          ctaMonthly: t(card?.ctaMonthly),
          ctaOnce: t(card?.ctaOnce),
          ctaOther: t(card?.ctaOther),
          noteWithPrefill: t(card?.noteWithPrefill),
          noteWithoutPrefill: t(card?.noteWithoutPrefill),
        }),
      },
      { anchor: 'give' },
    )
    if (give?.where) {
      const w = give.where
      p.add(
        'where',
        'sectionCards',
        'plain',
        { ...headingOf({ eyebrow: w.eyebrow, title: w.title }), cards: cardRows(w.items), note: [t(w.closingLead), t(w.closing)].filter(Boolean).join(' ') },
        { hidden: off(w) },
      )
    }
    if (give?.monthly) {
      const m = give.monthly
      p.add('monthly', 'sectionCards', 'plain', { ...headingOf({ eyebrow: m.eyebrow, title: m.title }), placement: 'side', cards: cardRows(m.items) }, { hidden: off(m) })
    }
    if (give?.levels) {
      const l = give.levels
      p.add(
        'levels',
        'sectionGivingLevels',
        'plain',
        { ...headingOf(l), buttonLabel: t(l.buttonLabel), footnote: t(l.footnote), footnoteLinkLabel: t(l.footnoteLinkLabel), footnoteLinkHref: t(l.footnoteLinkHref) },
        { anchor: 'levels', hidden: off(l) },
      )
    }
    if (give?.more) {
      const m = give.more
      p.add(
        'more',
        'sectionCards',
        'grey',
        {
          ...headingOf({ eyebrow: m.eyebrow, title: m.title }),
          cards: rows(m.items, (r) => Boolean(t(r.title)), (r) => ({ title: t(r.title), text: t(r.text), href: t(r.href) })),
        },
        { hidden: off(m) },
      )
    }
    if (give?.after) {
      const a = give.after
      p.add(
        'after',
        'sectionSteps',
        'plain',
        {
          ...headingOf({ eyebrow: a.eyebrow, title: a.title }),
          steps: rows(a.steps, (r) => Boolean(t(r.title)), (r) => ({ title: t(r.title), text: t(r.text) })),
          moreLabel: t(a.linkLabel),
          moreHref: t(a.linkLabel) ? t(a.linkHref) : undefined,
        },
        { variant: 'grid', hidden: off(a) },
      )
    }
    if (give?.fellowships && t(give.fellowships.title)) {
      const f = give.fellowships
      p.add(
        'fellowships',
        'sectionCards',
        'teal',
        {
          ...headingOf(f),
          placement: 'side',
          cards: rows(f.commitments, (r) => Boolean(t(r.heading)), (r) => ({ title: t(r.heading), text: t(r.text) })),
          moreLabel: t(f.buttonLabel),
          moreHref: t(f.buttonLabel) ? t(f.buttonHref) : undefined,
        },
        { anchor: 'fellowships', hidden: off(f) },
      )
    }
    if (give?.businesses && t(give.businesses.title)) {
      const b = give.businesses
      p.add(
        'businesses',
        'sectionCallout',
        'plain',
        { title: t(b.title), text: t(b.text) ?? t(b.title), moreLabel: t(b.buttonLabel), moreHref: t(b.buttonLabel) ? t(b.buttonHref) : undefined },
        { variant: 'tint', hidden: off(b) },
      )
    }
    faqSection(p, give?.faq)
    out.push({
      slug: SLUGS.give,
      path: GIVING_PATHS.give,
      title: t(give?.hero?.title) ?? 'Give to WUWF',
      navLabel: navName('give'),
      navOrder: NAV_ORDER.give,
      description: paragraphs(give?.hero?.body)[0] ?? 'Become a WUWF member, give in the way that fits your life, or fund reporting for Northwest Florida.',
      sections: p.sections,
    })
  }

  // ------------------------------------------------------------------ Other ways to give (board 14b)
  {
    const p = new Page('ways')
    const w = g.ways
    const details = w?.details
    p.add(
      'ways',
      'sectionWaysToGive',
      'grey',
      {
        label: t(w?.hero?.eyebrow),
        headline: t(w?.hero?.title),
        line: t(w?.hero?.body),
        groups: rows(w?.groups, (r) => Boolean(r.key && t(r.label)), (r) => ({ key: r.key, label: t(r.label), best: t(r.best), effort: t(r.effort) })),
        panels: rows(
          w?.panels,
          (r) => Boolean(r.group && t(r.slug)),
          (r) => ({
            group: r.group,
            slug: t(r.slug),
            tabLabel: t(r.tabLabel),
            eyebrow: t(r.eyebrow),
            title: t(r.title),
            lead: t(r.lead),
            buttonLabel: t(r.buttonLabel),
            buttonHref: t(r.buttonLabel) ? t(r.buttonHref) : undefined,
            secondaryLabel: t(r.secondaryLabel),
            secondaryHref: t(r.secondaryLabel) ? t(r.secondaryHref) : undefined,
            showDetails: r.showDetails ? true : undefined,
            steps: lineTexts(r.steps).join('\n'),
            notes: lineTexts(r.notes).join('\n'),
          }),
        ),
        stepsTitle: t(w?.stepsTitle),
        notesTitle: t(w?.notesTitle),
        detailsTitle: t(details?.title),
        copyLabel: t(details?.copyLabel),
        copiedLabel: t(details?.copiedLabel),
        detailsNote: t(details?.note),
      },
      { anchor: 'ways' },
    )
    const c = w?.contact
    if (t(c?.title)) p.add('contact', 'sectionGivingContact', 'dark', { headline: t(c?.title), line: t(c?.text), callLabel: t(c?.callLabel), emailLabel: t(c?.emailLabel) }, { anchor: 'contact', variant: 'band' })
    out.push({
      slug: SLUGS.ways,
      path: GIVING_PATHS.ways,
      title: t(w?.hero?.title) ?? 'Other ways to give to WUWF',
      navLabel: navName('ways'),
      navOrder: NAV_ORDER.ways,
      description: paragraphs(w?.hero?.body)[0] ?? '',
      sections: p.sections,
    })
  }

  // ------------------------------------------------------------------ Leave a legacy (board 14c)
  {
    const p = new Page('legacy')
    const l = g.legacy
    const card = l?.contactCard
    p.add(
      'hero',
      'sectionGivingContact',
      'dark',
      {
        label: t(l?.hero?.eyebrow),
        headline: t(l?.hero?.title),
        line: t(l?.hero?.body),
        cardTitle: t(card?.title),
        cardText: t(card?.text),
        cardNote: t(card?.note),
        callLabel: t(card?.callLabel),
        emailLabel: t(card?.emailLabel),
      },
      { variant: 'hero' },
    )
    if (l?.routes) {
      const r = l.routes
      p.add('routes', 'sectionCards', 'plain', { ...headingOf({ eyebrow: r.eyebrow, title: r.title }), cards: rows(r.items, (x) => Boolean(t(x.title)), (x) => ({ tag: t(x.tag), title: t(x.title), text: t(x.text) })) }, { hidden: off(r) })
    }
    if (l?.sample && t(l.sample.quote)) {
      const s = l.sample
      p.add(
        'sample',
        'sectionFeature',
        'grey',
        { label: t(s.eyebrow), headline: t(s.title) ?? 'Sample language', line: t(s.body), aside: 'quote', asideText: t(s.quote), asideNote: t(s.quoteNote) },
        { variant: 'split', hidden: off(s) },
      )
    }
    if (l?.steps) {
      const s = l.steps
      p.add('steps', 'sectionSteps', 'plain', { ...headingOf({ eyebrow: s.eyebrow, title: s.title }), steps: rows(s.items, (x) => Boolean(t(x.title)), (x) => ({ title: t(x.title), text: t(x.text) })) }, { variant: 'grid', hidden: off(s) })
    }
    if (l?.recognition && t(l.recognition.text)) {
      const r = l.recognition
      p.add('recognition', 'sectionCallout', 'plain', { title: t(r.eyebrow), text: t(r.text) }, { variant: 'lime', hidden: off(r) })
    }
    faqSection(p, l?.faq)
    out.push({
      slug: SLUGS.legacy,
      path: GIVING_PATHS.legacy,
      title: t(l?.hero?.title) ?? 'Leave a legacy to WUWF',
      navLabel: navName('legacy'),
      navOrder: NAV_ORDER.legacy,
      description: paragraphs(l?.hero?.body)[0] ?? '',
      sections: p.sections,
    })
  }

  // ------------------------------------------------------------------ Thank you (board 14d)
  {
    const p = new Page('thanks')
    const th = g.thanks
    const actions = [
      ...(t(th?.primaryLabel) && t(th?.primaryHref) ? [{ label: t(th?.primaryLabel)!, href: t(th?.primaryHref)! }] : []),
      ...(t(th?.secondaryLabel) && t(th?.secondaryHref) ? [{ label: t(th?.secondaryLabel)!, href: t(th?.secondaryHref)! }] : []),
    ]
    p.add(
      'thanks',
      'sectionThankYou',
      'softlime',
      {
        label: t(th?.eyebrow),
        title: t(th?.title) ?? 'Thank you',
        titleNamed: t(th?.titleNamed),
        body: t(th?.body),
        bodyMonthly: t(th?.bodyMonthly),
        bodyOnce: t(th?.bodyOnce),
        actions,
        nextTitle: t(th?.nextTitle),
        next: rows(th?.next, (r) => Boolean(t(r.lead)), (r) => ({ lead: t(r.lead), text: t(r.text) })),
        promptTitle: t(th?.promptTitle),
        promptLabel: t(th?.promptLabel),
        promptHref: t(th?.promptLabel) ? t(th?.promptHref) : undefined,
      },
    )
    if (th?.while && (th.while.items?.length ?? 0) > 0) {
      const w = th.while
      p.add('while', 'sectionCards', 'plain', { ...headingOf({ eyebrow: w.eyebrow, title: w.title }), cards: rows(w.items, (r) => Boolean(t(r.title)), (r) => ({ title: t(r.title), text: t(r.text), href: t(r.href) })) }, { hidden: off(w) })
      if (t(th.helpLine)) p.add('help', 'sectionGivingContact', 'plain', { line: t(th.helpLine) }, { variant: 'line', hidden: off(w) })
    }
    out.push({
      slug: SLUGS.thanks,
      path: GIVING_PATHS.thanks,
      title: 'Thank you',
      navLabel: '',
      navOrder: 4,
      description: '',
      sections: p.sections,
      noindex: true,
      noReferrer: true,
    })
  }

  return out
}

export type { Tone }
