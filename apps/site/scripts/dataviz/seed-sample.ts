// A demonstration story with one of each kind of visualization, for looking at the data visualization system on a database on this machine or on staging.
// Everything is labelled "demonstration"; the numbers are invented and the county shapes are rough boxes, not boundaries.
//
//   pnpm tsx --tsconfig tsconfig.json scripts/dataviz/seed-sample.ts --local-rehearsal --go
//
// It refuses any database that is not staging or local (`checkStagingDatabase`), is safe to run twice (it reuses what it made, by title), and sends nothing.

import dotenv from 'dotenv'

import { checkStagingDatabase } from '../../src/lib/assets/staging-guard'

dotenv.config({ path: '.env.local' })
dotenv.config()

const args = process.argv.slice(2)
const guard = checkStagingDatabase(process.env.DATABASE_URL, { allowLocal: args.includes('--local-rehearsal') })
if (!guard.ok) throw new Error(`Refusing to seed: ${guard.reason}`)
if (!args.includes('--go')) {
  console.log(`Dry run against ${guard.where}. Pass --go to write.`)
  process.exit(0)
}

const { getPayload } = await import('payload')
const { default: config } = await import('@payload-config')
const payload = await getPayload({ config })
const ctx = { disableRevalidate: true, disableEmbedding: true }
const TAG = ' (demonstration)'

type Made = { id: number | string }
async function once(collection: 'datasets' | 'visualizations' | 'posts' | 'sections', title: string, make: () => Promise<Made>): Promise<Made> {
  const found = await payload.find({ collection, where: { title: { equals: title } }, limit: 1, depth: 0, overrideAccess: true, draft: true })
  return (found.docs[0] as unknown as Made | undefined) ?? make()
}
const csv = (name: string, text: string) => ({ data: Buffer.from(text), name, mimetype: 'text/csv', size: Buffer.byteLength(text) })
async function dataset(title: string, fileName: string, text: string, extra: Record<string, unknown> = {}) {
  const d = await once('datasets', title + TAG, () =>
    payload.create({ collection: 'datasets', context: ctx, overrideAccess: true, data: { title: title + TAG, source: { name: 'Demonstration data, invented for review' }, methodology: 'These numbers were made up to show how the page looks.\n\nThey are not real.', ...extra } as never }) as never,
  )
  const have = await payload.find({ collection: 'dataset-versions', where: { dataset: { equals: d.id } }, limit: 1, depth: 0, overrideAccess: true })
  if (!have.docs[0]) await payload.create({ collection: 'dataset-versions', context: ctx, overrideAccess: true, file: csv(fileName, text) as never, data: { dataset: d.id, published: true, label: 'Demonstration' } as never })
  return d
}

const years = `Year,Escambia,Santa Rosa,Okaloosa,Walton\n2019,120,80,60,35\n2020,300,150,90,60\n2021,210,170,130,75\n2022,180,160,140,90\n2023,150,175,150,110\n2024,140,190,165,125\n`
const rates = `FIPS,County,Rate,Population\n12033,Escambia,412.5,321905\n12113,Santa Rosa,288,188000\n12091,Okaloosa,236.25,216000\n12131,Walton,174,80000\n`
const roster = `Station,Show,Day,Listeners\nWUWF,Morning Edition,Weekdays,18200\nWUWF,All Things Considered,Weekdays,15100\nWUWF,Fresh Air,Weekdays,6400\nWUWF,Wait Wait... Don't Tell Me!,Saturday,5200\nWUWF,Car Talk,Saturday,3900\nWUWF,Radiolab,Sunday,2800\nWUWF,Planet Money,Friday,2400\nWUWF,Reveal,Sunday,1500\n`
const box = (x: number, y: number, w: number, h: number) => ({ type: 'Polygon', coordinates: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]] })
const shapes = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { GEOID: '12033', NAME: 'Escambia' }, geometry: box(-87.6, 30.4, 0.55, 0.6) },
    { type: 'Feature', properties: { GEOID: '12113', NAME: 'Santa Rosa' }, geometry: box(-87.05, 30.4, 0.6, 0.7) },
    { type: 'Feature', properties: { GEOID: '12091', NAME: 'Okaloosa' }, geometry: box(-86.45, 30.4, 0.65, 0.7) },
    { type: 'Feature', properties: { GEOID: '12131', NAME: 'Walton' }, geometry: box(-85.8, 30.4, 0.7, 0.75) },
  ],
})

const cases = await dataset('Cases by county', 'cases.csv', years)
const rate = await dataset('County rates', 'rates.csv', rates)
const counties = await dataset('Panhandle county shapes', 'counties.geojson', shapes)
const shows = await dataset('Weekly listeners by show', 'listeners.csv', roster)

const viz = (title: string, data: Record<string, unknown>) =>
  once('visualizations', title, () =>
    payload.create({ collection: 'visualizations', context: ctx, overrideAccess: true, draft: false, data: { title, dataMode: 'latest', _status: 'published', showDownload: true, ...data } as never }) as never,
  )

const line = await viz('Cases peaked in 2020, then fell in most counties', {
  kind: 'chart', dataset: cases.id, caption: 'Weekly average cases, 2019 to 2024. Demonstration data.',
  altText: 'A line chart of cases in four counties from 2019 to 2024. Escambia rose sharply to 300 in 2020 and then fell; Okaloosa and Walton climbed steadily.',
  chart: { type: 'line', x: 'Year', y: ['Escambia', 'Santa Rosa', 'Okaloosa', 'Walton'], yLabel: 'Cases', yFormat: { style: 'number' } },
})
const bars = await viz('Morning Edition draws the biggest audience', {
  kind: 'chart', dataset: shows.id, caption: 'Average weekly listeners. Demonstration data.',
  altText: 'A bar chart ranking eight shows by weekly listeners. Morning Edition is first with about 18,000; Reveal is last with about 1,500.',
  chart: { type: 'bar', x: 'Show', y: ['Listeners'], sort: 'valueDesc', yFormat: { style: 'number', compact: true } },
})
const map = await viz('Escambia County has the highest rate', {
  kind: 'map', dataset: rate.id, caption: 'Cases per 100,000 people. Shapes are rough boxes for review, not real boundaries.',
  altText: 'A map of four Panhandle counties shaded by case rate. Escambia, at the west, is darkest at 412 per 100,000; Walton, at the east, is lightest at 174.',
  map: { geometry: 'boundaries', boundaryDataset: counties.id, joinColumn: 'County', boundaryKey: 'NAME', valueColumn: 'Rate', labelColumn: 'County', classes: 4, legendTitle: 'Cases per 100,000', interactive: true },
})
const table = await viz('Every show, with its day and audience', {
  kind: 'table', dataset: shows.id, caption: 'Sort by a heading, or search.',
  altText: 'A table of eight shows with the day each airs and its weekly listeners.',
  table: { columns: [{ column: 'Show' }, { column: 'Day' }, { column: 'Listeners', format: { style: 'number' } }], sortColumn: 'Listeners', sortDirection: 'desc', searchable: true, pageSize: 5 },
})
const embed = await viz('An embedded chart from Datawrapper', {
  kind: 'embed', altText: 'A chart embedded from another service.', source: { name: 'Datawrapper (demonstration address)' },
  embed: { url: 'https://datawrapper.dwcdn.net/abc12/1/', width: 600, height: 400 }, showDownload: false,
})
void embed

const section = await once('sections', 'Demonstration', () => payload.create({ collection: 'sections', context: ctx, overrideAccess: true, data: { title: 'Demonstration' } as never }) as never)
const text = (t: string) => ({ type: 'text', version: 1, text: t, format: 0, mode: 'normal', style: '', detail: 0 })
const para = (t: string) => ({ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [text(t)] })
const block = (id: number | string, size = 'column') => ({ type: 'block', version: 2, format: '', fields: { id: `viz-${id}-${size}`, blockType: 'dataViz', visualization: id, size } })
const content = {
  root: {
    type: 'root', version: 1, direction: 'ltr', format: '', indent: 0,
    children: [
      para('This is a demonstration story. Every number in it is invented, to show how charts, maps and tables look in a WUWF story.'),
      block(line.id),
      para('A chart is drawn on the server and has no script of its own. Under it, the data is available as a plain table, and the figure says where the numbers came from.'),
      block(bars.id),
      para('A map colours areas in equal steps. A reader can press the button to pan and zoom.'),
      block(map.id, 'wide'),
      para('And a table can be sorted and searched.'),
      block(table.id),
    ],
  },
}
const story = await once('posts', 'A demonstration story with charts, a map and a table', async () =>
  payload.create({ collection: 'posts', context: ctx, overrideAccess: true, draft: false, data: { title: 'A demonstration story with charts, a map and a table', content, section: section.id, _status: 'published', source: 'wuwf', format: 'web' } as never }) as never,
)
const saved = await payload.findByID({ collection: 'posts', id: story.id, depth: 0, overrideAccess: true })
console.log(`Story path: ${saved.path}`)
process.exit(0)
