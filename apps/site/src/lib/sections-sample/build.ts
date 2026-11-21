// The internal sample page for the section library (PAGE-BLOCKS.md, phase 2): every block, in every tone, with sample words from the design
// canvas. Pure: it builds the sections from what the caller found in the database (`SampleRefs`), and the script writes them. A new block
// has no sample until it is added to `SAMPLES`, and `build.test.ts` fails until it is, so the page for the owner's review never goes stale.
//
// Every variant of a block appears at least once: the variants are dealt out across the six tones in turn (a block with two layouts shows
// each three times). A data block draws what the database it is written to holds, so a source with nothing in it draws nothing there.

import { SECTION_BLOCKS } from '@/blocks/sections/registry'
import { TONES, type Tone } from '@/lib/page-themes/themes'

/** Records the script found on the database it runs against. Every one is optional: a block whose record is missing draws nothing. */
export interface SampleRefs {
  /** Pictures from the media library, in the order to use them. */
  mediaIds: Array<number | string>
  postId?: number | string
  sectionId?: number | string
  topicId?: number | string
  productionId?: number | string
  fellowshipId?: number | string
  /** The moment the sample is made: typed dates are set relative to it. */
  now: Date
}

export interface SampleSection {
  id: string
  blockType: string
  anchor: string
  tone: Tone
  hidden: false
  variant?: string
  [field: string]: unknown
}

const text = (t: string) => ({ type: 'text', version: 1, text: t, format: 0, mode: 'normal', style: '', detail: 0 })
const para = (t: string) => ({ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [text(t)] })
const heading = (t: string) => ({ type: 'heading', tag: 'h3', version: 1, direction: 'ltr', format: '', indent: 0, children: [text(t)] })
const lexical = (...children: unknown[]) => ({ root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children } })

const kebab = (slug: string): string => slug.replace(/^section/, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
const pic = (refs: SampleRefs, i: number): number | string | undefined => (refs.mediaIds.length > 0 ? refs.mediaIds[i % refs.mediaIds.length] : undefined)
const day = (refs: SampleRefs, plus: number, hour: number): string => {
  const d = new Date(Date.UTC(refs.now.getUTCFullYear(), refs.now.getUTCMonth(), refs.now.getUTCDate() + plus, hour))
  return d.toISOString()
}

type Maker = (c: { tone: Tone; toneIndex: number; variant: string | null; refs: SampleRefs; label: string }) => Record<string, unknown>
const head = (label: string, intro?: string) => ({ heading: { eyebrow: label, title: 'A heading in this tone', ...(intro ? { intro } : {}) } })

/** One maker per section block, by slug. */
export const SAMPLES: Record<string, Maker> = {
  sectionFeature: ({ refs, toneIndex, label }) => ({
    label: `${label} · Next show · Thursday, Dec. 3 · 6 p.m.`,
    headline: 'Nicholas Edward Williams, Pat Byrn & Julie Patcouli',
    line: 'Three songwriters, one room, and a recording of it for everyone who could not be there.',
    actions: [{ label: 'Save your seat', href: '/radiolive' }, { label: 'Watch recent shows', href: '/radiolive#watch' }],
    image: pic(refs, toneIndex),
    ratio: (['standard', 'portrait', 'wide'] as const)[toneIndex % 3],
    imageSide: toneIndex % 2 === 0 ? 'right' : 'left',
  }),
  sectionFeaturedRecord: ({ refs, toneIndex, label }) => ({
    label,
    ...(refs.postId !== undefined
      ? { mode: 'pick', record: { relationTo: 'posts', value: refs.postId } }
      : refs.sectionId !== undefined
        ? { mode: 'newest', section: refs.sectionId }
        : { mode: 'pick' }),
    ratio: (['wide', 'standard', 'portrait'] as const)[toneIndex % 3],
    imageSide: toneIndex % 2 === 0 ? 'left' : 'right',
  }),
  // The home set's blocks. They read what the database holds (the newest stories, a section's, the shows), so on a database without it they draw nothing.
  sectionFrontPage: ({ refs }) => ({ ...(refs.postId !== undefined ? { lead: refs.postId } : {}), leadKicker: 'Sample lead' }),
  sectionFellowshipFeature: ({ refs }) => ({ ...(refs.fellowshipId !== undefined ? { fellowship: refs.fellowshipId } : {}), ...(refs.postId !== undefined ? { story: refs.postId } : {}) }),
  sectionNewsRun: ({ refs, label }) => ({ ...head(label), ...(refs.sectionId !== undefined ? { section: refs.sectionId } : {}), count: 4 }),
  sectionShowSpotlight: ({ refs }) => ({ ...(refs.productionId !== undefined ? { featuredShow: refs.productionId } : {}) }),
  sectionFeaturePanels: () => ({ radioLive: true, unearthing: true }),
  sectionProfileBand: ({ refs, toneIndex, variant, label }) =>
    variant === 'roster'
      ? {
          ...head(label),
          people: [
            { name: 'Tanya Gallagher', role: 'Host', photo: pic(refs, toneIndex) },
            { name: 'William Howell', role: 'Reporter', photo: pic(refs, toneIndex + 1) },
            { name: 'Dana Ortiz', role: 'Engineer', photo: pic(refs, toneIndex + 2) },
            { name: 'Sam Whitfield', role: 'Producer' },
          ],
        }
      : {
          ...head(label),
          text: 'WUWF has been on the air since 1988, from the University of West Florida to the Gulf Coast and the Panhandle.\n\nThe station is a service of the university and is supported by the people who listen.',
          image: pic(refs, toneIndex),
        },
  sectionCards: ({ label }) => ({
    ...head(label, 'Hand-typed cards with a title, text, a tag, a price and a link.'),
    cards: [
      { title: 'On air', tag: 'Radio', text: 'A short, plain message inside the news and music people already trust.', price: 'From $23 a credit', href: '/sponsor/on-air', linkLabel: 'See rates' },
      { title: 'Online', tag: 'Digital', text: 'A labelled sponsor message beside the stories people read.', href: '/sponsor/digital', linkLabel: 'See placements' },
      { title: 'Events', tag: 'In person', text: 'Put your name beside the things people go to.', href: '/sponsor/events' },
    ],
  }),
  sectionList: ({ refs, toneIndex, variant, label }) => {
    const plan = [
      { source: 'stories', scope: 'latest' },
      refs.sectionId !== undefined ? { source: 'stories', scope: 'section', section: refs.sectionId } : { source: 'stories', scope: 'latest' },
      refs.productionId !== undefined ? { source: 'episodes', show: refs.productionId } : { source: 'stories', scope: 'latest' },
      { source: 'videos' },
      { source: 'artists' },
      refs.topicId !== undefined ? { source: 'stories', scope: 'topic', topic: refs.topicId } : { source: 'stories', scope: 'latest' },
      { source: 'shows' },
      { source: 'episodes', allShows: true },
    ]
    const picked = plan[toneIndex % plan.length]!
    return { ...head(`${label} · ${String(picked.source)}`), ...picked, count: variant === 'lead' ? 4 : 6, moreLabel: 'All stories', moreHref: '/latest' }
  },
  sectionBroadcastSchedule: ({ label }) => head(label, 'The week’s programs for each stream, from the Listen live settings and NPR Cadence.'),
  sectionDates: ({ refs, toneIndex, label }) => ({
    ...head(label),
    source: (['typed', 'radiolive', 'events'] as const)[toneIndex % 3],
    count: 4,
    actionLabel: 'Details',
    items: [
      { title: 'Open house at the station', startsAt: day(refs, 9, 23), endsAt: day(refs, 10, 1), place: 'WUWF, 11000 University Pkwy', href: '/community-calendar' },
      { title: 'Pledge drive kickoff', startsAt: day(refs, 21, 15), place: 'On air and online', href: '/support' },
      { title: 'RadioLive: winter show', startsAt: day(refs, 33, 0), place: 'Museum of Commerce', href: '/radiolive' },
      { title: 'A date that has already passed', startsAt: day(refs, -20, 18) },
    ],
  }),
  sectionQuotes: ({ label }) => ({
    ...head(label),
    quotes: [
      { quote: 'Our customers tell us they heard us on WUWF before they ever walked in.', name: 'Pat Lee', role: 'Owner, Gulf Coast Hardware' },
      { quote: 'It is the one place a small business sounds as trusted as the news.', name: 'Maria Santos', role: 'Director, Pensacola Arts Council' },
      { quote: 'Plain, honest and local. Exactly what we wanted our name beside.', name: 'Jon Ellis' },
    ],
  }),
  sectionStats: ({ label }) => ({
    ...head(label),
    stats: [
      { value: '22,500', text: 'listen in a typical week', compare: '12,100' },
      { value: '79%', text: 'hold a more positive opinion of sponsors', compare: '43%' },
      { value: '77%', text: 'prefer to buy from NPR sponsors', compare: '51%' },
    ],
    valueLabel: 'NPR listeners',
    compareLabel: 'Non-listeners',
    source: 'Sample figures for review: Nielsen Audio, Pensacola metro, Spring 2026.',
  }),
  sectionSteps: ({ label }) => ({
    ...head(label),
    steps: [
      { title: 'Think it over', text: 'There is no hurry. Take the time that suits you.' },
      { title: 'Talk with your adviser', text: 'Bring the wording below, or let us send it.' },
      { title: 'Tell us, if you like', text: 'So we can say thank you. Anonymous is always fine.' },
    ],
  }),
  sectionQuestions: ({ label }) => ({
    ...head(label),
    items: [
      { question: 'How is sponsorship different from advertising?', answer: 'A sponsor credit is a short, plain message that names your business, what you do and how to find you.', linkLabel: 'Read the credit guidelines', linkHref: '/sponsor/guidelines' },
      { question: 'What goes in my credit?', answer: 'Your business name, what you do, where you are and how to find you.\n\nIt does not carry prices or calls to buy.' },
      { question: 'Is there a minimum?', answer: 'No. Gifts and sponsorships of every size matter.' },
    ],
  }),
  sectionCallout: ({ variant, label }) =>
    variant === 'quote'
      ? { title: label, text: 'I give [a dollar amount] to the University of West Florida Foundation, Inc., for the benefit of WUWF Public Radio.', cite: 'Sample language. Share this with your attorney.' }
      : { title: `${label} · Recognition, if you want it`, text: 'If you let us know, we can thank you now.\n\nAnonymous is always fine.' },
  sectionCheckList: ({ toneIndex, label }) => ({
    ...head(toneIndex % 2 === 0 ? `${label} · a credit includes` : `${label} · a credit leaves out`),
    mark: toneIndex % 2 === 0 ? 'check' : 'cross',
    items: toneIndex % 2 === 0 ? [{ text: 'Your business name' }, { text: 'What you do' }, { text: 'Where to learn more' }] : [{ text: 'Prices' }, { text: 'Claims to be the best' }, { text: 'Calls to buy' }],
  }),
  sectionTable: ({ label }) => ({
    ...head(label),
    caption: 'Sample rates per credit, by daypart. Not a price list.',
    columns: ['Daypart', 'Open', '3 months', '6 months', '1 year'],
    rows: [
      { cells: ['Morning Drive', '$55', '$50', '$46', '$44'] },
      { cells: ['Midday', '$40', '$36', '$34', '$30'] },
      { cells: ['Total Program Rotation', '$30', '$27', '$25.50', '$23'] },
    ],
  }),
  sectionPicker: ({ label }) => ({
    ...head(label),
    options: [
      { label: 'I am new', hint: 'Start small', title: 'Start with a few weeks', lead: 'A short run on one daypart shows you how it feels.', points: 'One daypart\nA plain, short credit\nNo long commitment', price: 'From $23 a credit', linkLabel: 'See the rates', linkHref: '/sponsor/on-air#rates' },
      { label: 'Promote an event', hint: 'Reach people before the date', title: 'Event sponsorship', lead: 'Your name beside the things people go to.', points: 'On air and online\nBefore and during', linkLabel: 'Event programs', linkHref: '/sponsor/events' },
      { label: 'Stay all year', title: 'Year-round', lead: 'The best rate for a business that wants to be heard all year.' },
    ],
  }),
  sectionText: ({ label }) => ({
    ...head(label),
    body: lexical(
      heading('The story editor, in a band'),
      para('The same editor a story uses, so a page can carry a few paragraphs of plain writing between its designed sections.'),
      para('It follows the tone of the band it sits in, so this text stays readable on every ground, and its links are underlined.'),
    ),
  }),
  // The fellowship first: its agreement is the one a demonstration database is most likely to hold. A record with no running agreement draws nothing.
  sectionCredit: ({ refs }) => ({
    target:
      refs.fellowshipId !== undefined
        ? { relationTo: 'fellowships', value: refs.fellowshipId }
        : refs.productionId !== undefined
          ? { relationTo: 'productions', value: refs.productionId }
          : undefined,
  }),
  sectionSupport: ({ label }) => ({
    heading: { eyebrow: label, title: 'Keep the music live', intro: 'Become a sustaining member and direct your support to the shows you love.' },
    label: 'Become a member',
    note: "You will go to WUWF's secure donation form.",
  }),
  sectionClosingBand: ({ label }) => ({
    heading: { eyebrow: label, title: 'Ready to talk?', intro: 'Tell us about your business and we will send a plan within two working days.' },
    actions: [{ label: 'Start a proposal', href: '/sponsor#inquire' }, { label: 'Call us', href: 'tel:+18504741234' }],
  }),
  sectionColumns: ({ label }) => ({
    heading: { eyebrow: label, title: 'Two things side by side' },
    columns: [
      { sections: [{ id: 'c1', blockType: 'sectionCheckList', hidden: false, mark: 'check', listTitle: 'A credit includes', items: [{ text: 'Your business name' }, { text: 'What you do, in plain words' }] }] },
      { sections: [{ id: 'c2', blockType: 'sectionCheckList', hidden: false, mark: 'cross', listTitle: 'A credit leaves out', items: [{ text: 'Prices' }, { text: 'Claims to be the best' }] }] },
    ],
  }),
  sectionIllustration: () => ({ label: 'Illustration · display ad', caption: 'Sponsor message', name: 'Example Credit Union', line: 'A member-owned credit union.', website: 'example.org' }),
  // Set-only blocks (the sponsor set). The sample page is in no set, which refuses them, so `buildSampleSections` leaves them out; the makers are
  // here so a new set-only block still has its words, and `build.test.ts` fails until it does.
  sectionRateEstimator: ({ label }) => ({
    heading: { eyebrow: label, title: 'On-air rates, by the credit' },
    note: 'Rates are per credit. WUWF confirms every schedule.',
    estimatorEyebrow: 'Estimate',
    estimatorTitle: 'Estimate a schedule',
    commitmentLabel: 'Length of commitment',
    creditsLabel: 'Credits in the schedule',
    estimatorDisclaimer: 'An estimate only.',
    estimatorCta: 'Request a proposal',
  }),
  sectionPackages: ({ label }) => ({ heading: { eyebrow: label, title: 'New sponsor packages' }, packageLabel: 'Package', note: 'Credits run within twelve months.' }),
  sectionCarpool: ({ label }) => ({
    heading: { eyebrow: label, title: 'The Carpool Plan' },
    perDayNote: 'or about $4 a day',
    slotsNote: 'Credits air in the morning and afternoon drive.',
    actions: [{ label: 'Ask about the Carpool Plan', href: '/sponsor#inquire' }],
  }),
  sectionOpenPrograms: ({ label }) => ({
    heading: { eyebrow: label, title: 'Events and programs open to sponsors' },
    titleOne: 'One program is open to sponsors',
    emptyText: 'Nothing is open to sponsors right now.',
    talkLabel: 'Talk to us about {name}',
    moreLabel: 'About {name}',
    levelsLabel: 'Ways to partner',
    recognitionLabel: 'Where you are named:',
  }),
  sectionInquiryForm: ({ label }) => ({
    heading: { eyebrow: label, title: 'Get a proposal', intro: 'Tell us what you want to achieve.\n\nCorporate support replies within two working days.' },
    contactTitle: 'Prefer to talk?',
    submitLabel: 'Request a proposal',
    sendingLabel: 'Sending',
    labels: { name: 'Your name', organization: 'Organization', email: 'Email', phone: 'Phone', interests: 'What are you interested in?', budget: 'Budget', message: 'Anything else?', required: 'required' },
    thanksTitle: 'Thank you',
    thanksPrefix: 'Here is what you told us you are interested in:',
  }),
  // Set-only blocks (the giving set): left out of the page for the same reason.
  sectionGiftCard: ({ label }) => ({
    label,
    headline: 'Local news, NPR and music, paid for by the people who use them.',
    line: 'A monthly gift is the most useful way to give: it lets the station plan.',
    assurances: [{ text: 'Tax-deductible as allowed by law' }, { text: 'Change or stop anytime' }],
    card: { monthlyLabel: 'Monthly', monthlySub: 'Most useful', onceLabel: 'One time', onceSub: 'Give once', otherLabel: 'Other', anyTitle: 'Any amount helps' },
  }),
  sectionGivingLevels: ({ label }) => ({
    heading: { eyebrow: label, title: 'Membership levels' },
    buttonLabel: 'Give at this level',
    footnote: 'A level is a thank-you for a gift, not the thing being bought.',
  }),
  sectionWaysToGive: ({ label }) => ({
    label,
    headline: 'Other ways to give to WUWF',
    line: 'Choose the way that fits your life.',
    groups: [{ key: 'vehicles', label: 'Vehicle or boat', best: 'You have one to part with.', effort: 'One phone call' }],
    panels: [{ group: 'vehicles', slug: 'vehicles', eyebrow: 'Vehicle or boat', title: 'Donate a vehicle', lead: 'We take care of the paperwork.', buttonLabel: 'Start a donation', buttonHref: '/support', steps: 'Tell us about it\nWe arrange the pickup', notes: 'Tax rules vary.' }],
    stepsTitle: 'How it works',
    notesTitle: 'Good to know',
  }),
  sectionThankYou: ({ label }) => ({
    label,
    title: 'Thank you. You are part of WUWF now.',
    titleNamed: 'Thank you, {name}. You are part of WUWF now.',
    body: 'Your gift keeps the station on the air.',
    actions: [{ label: 'Listen live', href: '/listen' }],
    nextTitle: 'What happens next',
    next: [{ lead: 'This week.', text: 'A receipt arrives by email.' }],
  }),
  sectionGivingContact: ({ label, variant }) => ({
    label,
    headline: 'Talk to a person',
    line: variant === 'line' ? 'Questions about your gift? Call {phone}.' : 'Member Services can help with any of this.',
    cardTitle: 'Member Services',
    callLabel: 'Call {phone}',
    emailLabel: 'Email us',
  }),
  sectionAskWuwf: ({ label }) => ({
    label,
    headline: 'Your questions shape our reporting.',
    line: 'Ask us something. Suggest a story. Answer a reporter. A person at WUWF reads every word.',
    jumpLinks: true,
  }),
  sectionListeningOpen: ({ label, variant }) => ({
    ...head(label, 'Each question is open for a while, and there is more than one way to answer it.'),
    emptyText: 'No reporter has a question open right now. Check back soon.',
    tableText: 'Gather a few people in your kitchen, a break room or a church hall. Your phone reads the question and records the conversation once everyone agrees.',
    voiceOnlyIntro: variant === 'reporters' ? 'One reporter, one story, a few minutes by voice.' : undefined,
  }),
  sectionListeningSessions: ({ label }) => head(label, 'Sit down with your neighbors at a table, and a WUWF journalist listens to what was said.'),
  sectionListeningOutcomes: ({ label }) => head(label),
  sectionHostForm: ({ label }) => head(label),
}

const variantsOf = (fields: ReadonlyArray<{ name?: string; options?: unknown }>): string[] => {
  const f = fields.find((x) => x.name === 'variant')
  return Array.isArray(f?.options) ? (f.options as Array<{ value: string }>).map((o) => o.value) : []
}

/** The sample sections: each block in the library's order, six times, once per tone, its variants dealt out in turn. */
export function buildSampleSections(refs: SampleRefs): SampleSection[] {
  const out: SampleSection[] = []
  for (const entry of SECTION_BLOCKS) {
    const slug = entry.block.slug
    if (entry.sets || entry.inlineOnly) continue // a set-only block cannot be on a page in no set, and an inline-only block is not on a page's own list (their samples are in SAMPLES, for the test)
    const make = SAMPLES[slug]
    if (!make) throw new Error(`No sample for ${slug}: add it to SAMPLES in lib/sections-sample/build.ts.`)
    const variants = variantsOf(entry.block.fields as never)
    TONES.forEach((tone, toneIndex) => {
      const variant = variants.length > 0 ? variants[toneIndex % variants.length]! : null
      const label = `${entry.block.labels?.singular ?? slug}${variant ? ` (${variant})` : ''} · ${tone}`
      const fields = make({ tone, toneIndex, variant, refs, label })
      const cleaned = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined))
      out.push({ id: `sample-${kebab(slug)}-${tone}`, blockType: slug, anchor: `${kebab(slug)}-${tone}`, tone, hidden: false, ...(variant ? { variant } : {}), ...cleaned })
    })
  }
  return out
}

export const SAMPLE_PAGE = {
  title: 'Section library sample (internal)',
  slug: 'internal-sections-sample',
  summary: 'Every section block in every tone, for the owner to review at phone, tablet and desktop widths. Not linked from anywhere.',
} as const
