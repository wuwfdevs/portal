// Seeds a spread of UPCOMING community-calendar events into the LOCAL development database, so the calendar and event pages
// can be looked at in a browser (the Grove events in the census are all in the past). It refuses any database that is not on
// this machine, writes nothing else, and is safe to run twice (it matches on the title).
//
//   NODE_ENV=production pnpm exec tsx scripts/dev/seed-events.ts

import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()
const host = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost/none').hostname
if (!['localhost', '127.0.0.1', '::1', 'db'].includes(host)) throw new Error(`Refusing to seed a non-local database (${host}).`)

const { getPayload } = await import('payload')
const config = (await import('../../src/payload.config')).default
const { addDays, stationToday } = await import('../../src/lib/events/schedule')
const { lexicalFromPlain, teaserOf } = await import('../../src/lib/events/stored')

const payload = await getPayload({ config })
const today = stationToday(new Date())
const cat = async (slug: string) => (await payload.find({ collection: 'event-categories', where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]!.id

const venue = (name: string, city = 'Pensacola', street?: string) => ({ name, city, state: 'FL', ...(street ? { street } : {}) })
const lorem = 'Join neighbors for an afternoon of music, food and conversation.\n\nAll ages are welcome. Parking is free in the lot behind the building, and the doors open thirty minutes early.'

const events = [
  { title: 'Pensacola Symphony Orchestra: Holiday Pops', cats: ['music-classical', 'theater'], venue: venue('Saenger Theatre', 'Pensacola', '118 S Palafox St'), org: { name: 'Pensacola Symphony Orchestra', website: 'https://pensacolasymphony.com/', email: 'info@pensacolasymphony.com', phone: '850-435-2533', designation: 'not-for-profit' }, price: '$25 - $115', ticketUrl: 'https://pensacolasymphony.com/tickets', schedule: { kind: 'once', date: addDays(today, 4), start: '19:00', end: '21:00' } },
  { title: 'Side Show', cats: ['theater', 'music-other', 'fairs-and-festivals'], venue: venue('The Gordon Community Art Center'), org: { name: 'PenArts' }, price: '$22', schedule: { kind: 'daily', startDate: addDays(today, -1), endDate: addDays(today, 5), start: '19:30', end: '21:30' } },
  { title: 'Palafox Market', cats: ['outdoors', 'community-events'], venue: venue('Downtown Plaza', 'Pensacola', 'Palafox & Wright'), org: { name: 'Palafox Market', designation: 'not-for-profit' }, free: true, schedule: { kind: 'weekly', startDate: addDays(today, -30), endDate: addDays(today, 90), everyWeeks: 1, slots: [{ day: '6', start: '09:00', end: '14:00' }] } },
  { title: 'Gulf Coast Writers Circle', cats: ['classes-workshops', 'community-events'], venue: venue('Pensacola Library', 'Pensacola', '239 N Spring St'), org: { name: 'Gulf Coast Writers', designation: 'not-for-profit' }, free: true, schedule: { kind: 'monthly', startDate: addDays(today, -60), endDate: addDays(today, 200), everyMonths: 1, nth: '2', weekday: '2', start: '18:00', end: '19:30' } },
  { title: 'Beach Ecology Walk', cats: ['outdoors', 'kids-and-family'], venue: { name: 'Pensacola Beach' }, org: { name: 'Healthy Gulf', website: 'https://healthygulf.org', designation: 'not-for-profit' }, free: true, schedule: { kind: 'once', date: addDays(today, 11), start: '08:00', end: '09:30' } },
  { title: 'Virtual Information Session on Global Poverty', cats: ['community-events', 'benefits-fundraisers'], venue: { name: 'Virtual via Zoom' }, org: { name: 'The Borgen Project' }, free: true, schedule: { kind: 'once', date: addDays(today, 2), start: '17:00', end: '18:00' } },
  { title: 'Indoor Yard Sale at the Garden Center', cats: ['community-events', 'benefits-fundraisers'], venue: venue('Pensacola Garden Center', 'Pensacola', '1850 N 9th Avenue'), org: { name: 'Pensacola Federation of Garden Clubs', designation: 'not-for-profit' }, schedule: { kind: 'once', date: addDays(today, 18), start: '08:00', end: '14:00' } },
  { title: 'Kamerman Piano Series: Mark Markham', cats: ['music-classical'], venue: venue('UWF Center for Fine and Performing Arts', 'Pensacola', '11000 University Parkway'), org: { name: 'UWF Center for Fine and Performing Arts', website: 'https://uwf.edu/cfpa', designation: 'not-for-profit' }, price: '$7-20', ticketUrl: 'https://uwf.edu/cfpa', schedule: { kind: 'once', date: addDays(today, 25), start: '15:00', end: '17:00' } },
  { title: 'A listing whose date Grove could not read', cats: ['misc'], venue: venue('Somewhere in town'), schedule: { kind: 'listed', displayText: 'Every first Tuesday of the month, 6 PM' } },
] as const

let made = 0
for (const e of events) {
  const found = await payload.find({ collection: 'events', where: { title: { equals: e.title } }, limit: 1, depth: 0, overrideAccess: true })
  if (found.docs.length) continue
  await payload.create({
    collection: 'events',
    overrideAccess: true,
    context: { disableRevalidate: true },
    data: {
      title: e.title,
      teaser: teaserOf(lorem),
      description: lexicalFromPlain(lorem) as never,
      categories: await Promise.all(e.cats.map(cat)),
      schedule: e.schedule as never,
      venue: e.venue as never,
      organization: ('org' in e ? e.org : {}) as never,
      price: 'price' in e ? e.price : null,
      free: 'free' in e ? e.free : false,
      ticketUrl: 'ticketUrl' in e ? e.ticketUrl : null,
      _status: 'published',
    } as never,
  })
  made += 1
}
console.log(`seeded ${made} events (${events.length - made} already there)`)
process.exit(0)
