// Demonstration data: the Coastal Futures Fellowship, its (illustrative) funder Example Foundation, one story,
// and the header/footer links that exist today. Everything here is labelled illustrative on the site; none of it
// is real reporting or a real agreement. Safe to re-run: each record is found by its slug or name first.
//
//   pnpm seed:demo
//
// Refuses any database that is not on this machine.

import dotenv from 'dotenv'
import type { Payload } from 'payload'

// Next loads .env.local for the app; a script has to do it itself, and before the config is imported (Payload
// reads its secret and database URL when the config module is evaluated).
dotenv.config({ path: '.env.local' })
dotenv.config()

const host = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost/none').hostname
if (!['localhost', '127.0.0.1', '::1', 'db'].includes(host)) {
  throw new Error(`Refusing to seed demonstration data into a non-local database (${host}).`)
}

const para = (text: string) => ({
  type: 'paragraph', version: 1, direction: 'ltr' as const, format: '' as const, indent: 0,
  children: [{ type: 'text', version: 1, text, format: 0, mode: 'normal' as const, style: '', detail: 0 }],
})
const lexical = (...paras: string[]) => ({
  root: { type: 'root', version: 1, direction: 'ltr' as const, format: '' as const, indent: 0, children: paras.map(para) },
})
const link = (label: string, url: string) => ({ link: { type: 'custom' as const, label, url, newTab: false } })

async function ensure<T extends { id: string | number }>(
  payload: Payload, collection: string, where: Record<string, unknown>, data: Record<string, unknown>,
): Promise<T> {
  const found = await payload.find({ collection: collection as never, where: where as never, limit: 1, depth: 0, overrideAccess: true })
  if (found.docs[0]) return found.docs[0] as unknown as T
  return (await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: { disableRevalidate: true } })) as unknown as T
}

const { getPayload } = await import('payload')
const { default: config } = await import('@payload-config')
const payload = await getPayload({ config })

const sponsor = await ensure(payload, 'sponsors', { name: { equals: 'Example Foundation' } }, { name: 'Example Foundation', notes: 'Illustrative sponsor for the demonstration.' })
const agreement = await ensure(payload, 'underwriting-agreements', { label: { equals: 'Example Foundation — Coastal Futures, 2026–27' } }, {
  label: 'Example Foundation — Coastal Futures, 2026–27', sponsor: sponsor.id, kind: 'recognition', active: true,
  startsOn: '2026-07-01', endsOn: '2027-06-30',
  text: "Reporting through WUWF's Coastal Futures Fellowship is made possible in part by support from Example Foundation.",
  shortText: 'Supported in part by Example Foundation',
  independenceTerms: 'Illustrative. WUWF News assigns, edits and publishes all work; the funder does not review stories.',
})
const leigh = await ensure(payload, 'contributors', { name: { equals: 'Leigh Ostrander' } }, { name: 'Leigh Ostrander', title: 'Coastal Futures Fellow', bio: 'Illustrative profile. Covers housing, insurance and land use on the Gulf Coast.' })
const fellowship = await ensure(payload, 'fellowships', { title: { equals: 'Coastal Futures' } }, {
  title: 'Coastal Futures',
  summary: 'A year of reporting on how Northwest Florida lives with the Gulf: where we build, what it costs to stay, and who gets to decide.',
  mission: "Coastal Futures follows the money, rules and choices that shape life on the Gulf Coast between Perdido Key and Navarre: insurance, zoning, drainage, rebuilding, and the families caught in between.",
  fellow: leigh.id, termStartsOn: '2026-07-01', termEndsOn: '2027-06-30', agreements: [agreement.id],
})
const series = await ensure(payload, 'series', { title: { equals: 'After Isaias' } }, { title: 'After Isaias', summary: 'Recovery after the hurricane.' })
const topic = await ensure(payload, 'categories', { title: { equals: 'Growth & Development' } }, { title: 'Growth & Development' })
await ensure(payload, 'publishing-identities', { name: { equals: 'WUWF News' } }, { name: 'WUWF News', kind: 'newsroom', tagline: "NPR for Florida's Great Northwest" })

const story = await ensure(payload, 'posts', { title: { equals: 'Rebuild, raise or leave? After Isaias, Escambia homeowners face the choice the next storm will test' } }, {
  title: 'Rebuild, raise or leave? After Isaias, Escambia homeowners face the choice the next storm will test',
  dek: "For families on Perdido Key and in Warrington, the question isn't whether to fix the roof. It's whether the house, and the street, will still make sense in ten years.",
  format: 'web', _status: 'published', publishedAt: '2026-10-28T12:00:00.000Z',
  fellowship: fellowship.id, series: series.id, categories: [topic.id], contributors: [leigh.id],
  content: lexical(
    "Illustrative text for the demonstration; this is not reporting.",
    "The first contractor who walked Dana Whitlock's roof after Isaias quoted her a repair. The second one asked a different question: how many more of these did she plan to pay for?",
    "It's the question hanging over hundreds of households in southern Escambia County this month. Isaias didn't flatten their homes. It did enough damage to force a decision that a lot of families had been putting off.",
  ),
})

// A second illustrative story that uses every body block, for checking them in a browser. It includes deliberately
// hostile preserved HTML; only the sanitized result may ever reach a page.
const block = (blockType: string, fields: Record<string, unknown>) => ({ type: 'block', version: 2, format: '' as const, fields: { id: `seed-${blockType}`, blockType, ...fields } })
const logo = await ensure<{ id: string | number }>(payload, 'media', { filename: { equals: 'wuwf-logo.png' } }, { alt: 'WUWF 88.1 wordmark' }).catch(async () =>
  payload.create({ collection: 'media', data: { alt: 'WUWF 88.1 wordmark' }, filePath: 'public/wuwf-logo.png', overrideAccess: true }),
)
await ensure(payload, 'posts', { title: { equals: 'Block parity sampler (illustrative)' } }, {
  title: 'Block parity sampler (illustrative)', format: 'web', _status: 'published', publishedAt: '2026-10-30T12:00:00.000Z',
  fellowship: fellowship.id, contributors: [leigh.id],
  content: { root: { type: 'root', version: 1, direction: 'ltr' as const, format: '' as const, indent: 0, children: [
    para('This story exists to show each body block. It is illustrative, not reporting.'),
    block('pullQuote', { text: "It's not a roof. It's a vote on whether my kids grow up here.", attribution: 'Illustrative quote' }),
    block('embed', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'An illustrative video', caption: 'An embedded video. Frames load only for approved hosts.' }),
    block('gallery', { title: 'A gallery', layout: 'grid', images: [1, 2, 3].map((n) => ({ image: logo.id, caption: `Image ${n}`, credit: 'WUWF' })) }),
    block('promo', { target: { relationTo: 'posts', value: story.id } }),
    para('Below is preserved HTML from an imaginary old page, including a script, an inline handler and a javascript: link. Only the safe part should appear.'),
    block('legacyHtml', { note: 'Illustrative', html: '<h3>Preserved heading</h3><p onclick="alert(1)">Kept paragraph with <a href="javascript:alert(1)">a bad link</a> and <a href="https://wuwf.org">a good one</a>.</p><script>alert(1)</script><iframe src="https://evil.example"></iframe>' }),
  ] } },
})

// Navigation: only pages that exist today.
await payload.updateGlobal({ slug: 'header', overrideAccess: true, context: { disableRevalidate: true }, data: {
  navItems: [link('News', '/posts')],
  sections: [link('Coastal Futures', '/fellowships/coastal-futures')],
} })
await payload.updateGlobal({ slug: 'footer', overrideAccess: true, context: { disableRevalidate: true }, data: {
  columns: [{ heading: 'Support', links: [link('Donate', '/support')] }],
  navItems: [],
} })

// The giving page (board 14). Copy is the board's; the button addresses are example.org because the real donation
// form is not wired in yet. The [N] audience figures on the board are left out until WUWF can source them.
const give = (path: string) => 'https://give.example.org/' + path
await payload.updateGlobal({ slug: 'support-page', overrideAccess: true, context: { disableRevalidate: true }, data: {
  heading: 'Public service journalism for Northwest Florida, paid for by the people and businesses who live here.',
  figures: [{ value: '1981', label: 'on the air since' }],
  levels: [
    { name: 'Member', amount: 'From $5/mo', description: 'Support the newsroom and the stations. Direct it where you like.', ctaLabel: 'Join', ctaUrl: give('member'), emphasis: 'standard' },
    { name: 'Sustaining Member', amount: '$8+/mo', description: 'Members-only episodes of every WUWF original, in your own feed, plus the NPR+ Podcast Bundle. Renews automatically.', ctaLabel: 'Sustain', ctaUrl: give('sustaining'), emphasis: 'featured' },
    { name: 'Day Sponsor', amount: '$15+/mo', description: 'Everything above, plus a day sponsor message on 88.1, aired five times on a day you choose.', ctaLabel: 'Choose a day', ctaUrl: give('day-sponsor'), emphasis: 'standard' },
    { name: 'Crystal Circle', amount: '$100+/mo', description: 'Leadership giving, invitations and recognition. No cap.', ctaLabel: 'Learn more', ctaUrl: give('crystal-circle'), emphasis: 'leadership' },
    { name: 'Leave a Legacy', amount: 'In your will', description: 'A planned gift keeps public media here for the next generation.', ctaLabel: 'Talk with us', ctaUrl: give('legacy'), emphasis: 'standard' },
  ],
  otherWays: 'Also: vehicle and property donation · Combined Federal Campaign #33728 · gifts directed to RadioLive, the newsroom or a fellowship.',
  businessesBody: 'On-air credits, digital sponsor messages, newsletters, podcasts, RadioLive and reporting fellowships, built into one campaign around what you need to happen.',
  fellowshipsBody: 'Underwrite a year of coverage on an issue the region needs. Your support is acknowledged on every story, episode and video the fellowship produces — automatically, and consistently.',
  fellowshipsLinkLabel: 'See an example: Coastal Futures',
  fellowshipsLinkUrl: '/fellowships/coastal-futures',
  commitments: [
    { heading: 'WUWF decides', text: 'Topics, assignments, editing, publication.' },
    { heading: "You're acknowledged", text: 'On every piece, the hub page and on air.' },
    { heading: 'No review', text: "Funders don't see work before it's published." },
    { heading: 'Reporting back', text: 'Reach and impact reports each quarter.' },
  ],
  giftNotice: 'WUWF Public Media is a service of the University of West Florida. Gifts are tax-deductible as allowed by law.',
} })

console.log('Seeded the Coastal Futures demonstration.')
process.exit(0)
