import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { readVisualization } from '@/lib/dataviz/read'

// The data visualization system end to end on a real database: upload, versions, publish rules, pinning, and what a reader and an editor see.

const run = Date.now().toString(36)
let payload: Payload
const ctx = { disableRevalidate: true }
const made: Array<[string, number | string]> = []
const track = <T extends { id: number | string }>(collection: string, doc: T): T => (made.push([collection, doc.id]), doc)

const file = (name: string, text: string, mimetype = 'text/csv') => ({ data: Buffer.from(text), name, mimetype, size: Buffer.byteLength(text) })
const CSV = 'Year,Cases\n2020,10\n2021,25\n2022,18\n'
const editor = { id: 0, collection: 'users', roles: ['editor'] } as never

async function dataset(title = 'Cases') {
  return track('datasets', await payload.create({ collection: 'datasets', context: ctx, overrideAccess: true, data: { title: `${title} ${run}`, source: { name: 'Health Dept' }, methodology: 'Counted weekly.' } as never }))
}
async function version(datasetId: number | string, csv: string, published: boolean, name = 'cases.csv') {
  return track(
    'dataset-versions',
    await payload.create({ collection: 'dataset-versions', context: ctx, overrideAccess: true, file: file(name, csv) as never, data: { dataset: datasetId, published } as never }),
  ) as unknown as { id: number; version: number; published: boolean; format: string; rowCount: number; columns: Array<{ name: string; type: string }> }
}
async function viz(datasetId: number | string, extra: Record<string, unknown> = {}, status: 'draft' | 'published' = 'published') {
  return track(
    'visualizations',
    await payload.create({
      collection: 'visualizations',
      context: ctx,
      overrideAccess: true,
      draft: status === 'draft',
      data: { title: `Cases rose ${run}`, kind: 'chart', dataset: datasetId, dataMode: 'latest', altText: 'Cases rose each year.', chart: { type: 'line', x: 'Year', y: ['Cases'] }, _status: status, ...extra } as never,
    }),
  )
}
const publicRead = (id: number | string) => readVisualization({ payload, mode: { kind: 'public' } }, id)
const staffRead = (id: number | string) => readVisualization({ payload, mode: { kind: 'system' } }, id)

beforeAll(async () => {
  payload = await getPayload({ config })
})
afterAll(async () => {
  for (const [collection, id] of [...made].reverse()) await payload.delete({ collection: collection as 'media', id, overrideAccess: true, context: ctx }).catch(() => undefined)
})

describe('a dataset version', () => {
  it('is read when it is uploaded: format, rows, columns, a number counted up per dataset', async () => {
    const ds = await dataset()
    const v1 = await version(ds.id, CSV, false)
    const v2 = await version(ds.id, CSV + '2023,30\n', false)
    expect([v1.version, v2.version]).toEqual([1, 2])
    expect(v1.format).toBe('csv')
    expect(v1.rowCount).toBe(3)
    expect(v1.columns).toEqual([{ name: 'Year', type: 'number', empty: 0 }, { name: 'Cases', type: 'number', empty: 0 }])
  })
  it('is refused with the reason when the file cannot be read, so the editor learns at upload', async () => {
    const ds = await dataset()
    await expect(version(ds.id, 'a,b\n1,2,3\n', false)).rejects.toThrow(/Row 2 has 3 values/)
    await expect(version(ds.id, 'x', false, 'notes.docx')).rejects.toThrow(/\.csv, \.json or \.geojson/)
  })
  it('cannot have its file replaced, and cannot move to another dataset', async () => {
    const ds = await dataset()
    const other = await dataset('Other')
    const v = await version(ds.id, CSV, false)
    await expect(payload.update({ collection: 'dataset-versions', id: v.id, overrideAccess: true, context: ctx, file: file('b.csv', CSV) as never, data: {} })).rejects.toThrow(/cannot be replaced/)
    await expect(payload.update({ collection: 'dataset-versions', id: v.id, overrideAccess: true, context: ctx, data: { dataset: other.id } as never })).rejects.toThrow(/for good/)
  })
  it('is readable by the public only when published', async () => {
    const ds = await dataset()
    const staged = await version(ds.id, CSV, false)
    const live = await version(ds.id, CSV, true)
    const seen = await payload.find({ collection: 'dataset-versions', where: { dataset: { equals: ds.id } }, overrideAccess: false, depth: 0 })
    expect(seen.docs.map((d) => d.id)).toEqual([live.id])
    expect(staged.id).not.toBe(live.id)
  })
  it('only a publisher may publish it', async () => {
    const ds = await dataset()
    const v = await version(ds.id, CSV, false)
    const asEditor = await payload.update({ collection: 'dataset-versions', id: v.id, overrideAccess: false, user: editor, context: ctx, data: { published: true } as never }).catch(() => null)
    expect(asEditor?.published ?? false).toBe(false)
  })
})

describe('what a reader sees', () => {
  it('a published visualization on a published version draws, with source, methodology, data note and download', async () => {
    const ds = await dataset()
    await version(ds.id, CSV, true)
    const v = await viz(ds.id)
    const r = await publicRead(v.id)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.view.source).toEqual({ name: 'Health Dept', url: null })
    expect(r.view.methodology).toBe('Counted weekly.')
    expect(r.view.data).toMatchObject({ versionNumber: 1, pinned: false })
    expect(r.view.download?.label).toMatch(/^Download the data \(CSV/)
    expect(r.view.model.engine).toBe('chart')
  })
  it('a draft visualization is not drawn for the public, but is for an editor', async () => {
    const ds = await dataset()
    await version(ds.id, CSV, true)
    const v = await viz(ds.id, {}, 'draft')
    expect((await publicRead(v.id)).ok).toBe(false)
    expect((await staffRead(v.id)).ok).toBe(true)
  })
  it('a dataset with only a staged version draws for a preview and for no one else', async () => {
    const ds = await dataset()
    await version(ds.id, CSV, false)
    const v = await viz(ds.id, {}, 'draft')
    expect(await publicRead(v.id)).toMatchObject({ ok: false })
    expect(await staffRead(v.id)).toMatchObject({ ok: true })
  })
})

describe('latest or pinned', () => {
  it('following the latest picks up a newly published version; a pinned figure does not', async () => {
    const ds = await dataset()
    const v1 = await version(ds.id, CSV, true)
    const follows = await viz(ds.id)
    const pinned = await viz(ds.id, { dataMode: 'pinned', pinnedVersion: v1.id })
    await version(ds.id, CSV + '2023,99\n', true)
    const a = await publicRead(follows.id)
    const b = await publicRead(pinned.id)
    expect(a.ok && a.view.data?.versionNumber).toBe(2)
    expect(b.ok && b.view.data?.versionNumber).toBe(1)
    expect(b.ok && b.view.data?.pinned).toBe(true)
    const rows = (r: typeof a) => (r.ok && r.view.model.engine === 'chart' ? r.view.model.dataTable.rows.length : -1)
    expect([rows(a), rows(b)]).toEqual([4, 3])
  })
  it('a staged version is previewed without going live', async () => {
    const ds = await dataset()
    await version(ds.id, CSV, true)
    const v = await viz(ds.id)
    await version(ds.id, CSV + '2023,99\n', false)
    const pub = await publicRead(v.id)
    const prev = await staffRead(v.id)
    expect(pub.ok && pub.view.data?.versionNumber).toBe(1)
    expect(prev.ok && prev.view.data?.versionNumber).toBe(2)
  })
})

describe('editorial controls', () => {
  it('a version that would break a live visualization cannot be published, and says which', async () => {
    const ds = await dataset()
    await version(ds.id, CSV, true)
    const v = await viz(ds.id, { title: `Breaks ${run}` })
    const renamed = await version(ds.id, 'Year,Count\n2020,1\n', false)
    await expect(payload.update({ collection: 'dataset-versions', id: renamed.id, overrideAccess: true, context: ctx, data: { published: true } as never })).rejects.toThrow(/would break 1 live visualization.*Breaks/)
    expect((await publicRead(v.id)).ok).toBe(true)
  })
  it('a pinned figure does not stop a breaking version from going live', async () => {
    const ds = await dataset()
    const v1 = await version(ds.id, CSV, true)
    await viz(ds.id, { dataMode: 'pinned', pinnedVersion: v1.id })
    const renamed = await version(ds.id, 'Year,Count\n2020,1\n', false)
    const done = await payload.update({ collection: 'dataset-versions', id: renamed.id, overrideAccess: true, context: ctx, data: { published: true } as never })
    expect(done.published).toBe(true)
  })
  it('a visualization cannot be published without an accessible description, a source, or valid columns', async () => {
    const ds = await dataset()
    await version(ds.id, CSV, true)
    await expect(viz(ds.id, { altText: '' })).rejects.toThrow(/accessible description/)
    await expect(viz(ds.id, { chart: { type: 'line', x: 'Yr', y: ['Cases'] } })).rejects.toThrow(/"Yr" is not in this dataset/)
    const noSource = track('datasets', await payload.create({ collection: 'datasets', context: ctx, overrideAccess: true, data: { title: `No source ${run}` } as never }))
    await version(noSource.id, CSV, true)
    await expect(viz(noSource.id)).rejects.toThrow(/where the data comes from/)
  })
  it('a draft can be saved half-finished', async () => {
    const ds = await dataset()
    const v = await viz(ds.id, { altText: '', chart: { type: 'line' } }, 'draft')
    expect(v.id).toBeTruthy()
  })
  it('a dataset in use, and a version pinned, cannot be deleted', async () => {
    const ds = await dataset()
    const v1 = await version(ds.id, CSV, true)
    await viz(ds.id, { dataMode: 'pinned', pinnedVersion: v1.id })
    await expect(payload.delete({ collection: 'datasets', id: ds.id, overrideAccess: true, context: ctx })).rejects.toThrow(/used by 1 visualization/)
    await expect(payload.delete({ collection: 'dataset-versions', id: v1.id, overrideAccess: true, context: ctx })).rejects.toThrow(/pinned to this version/)
  })
  it('an embed needs no dataset, but needs a source', async () => {
    const base = { kind: 'embed', dataset: undefined, chart: undefined, embed: { url: 'https://datawrapper.dwcdn.net/abc12/1/' }, altText: 'A chart of cases.' }
    await expect(viz(undefined as never, { ...base })).rejects.toThrow(/Say who made it/)
    const ok = await viz(undefined as never, { ...base, source: { name: 'Datawrapper user' } })
    const r = await publicRead(ok.id)
    expect(r.ok && r.view.model.engine).toBe('embed')
    expect(r.ok && r.view.download).toBeNull()
  })
})

describe('a map joined to boundaries', () => {
  it('draws, counts unmatched rows, and refuses a publish that matches nothing', async () => {
    const shapes = await dataset('Counties')
    await version(
      shapes.id,
      JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { NAME: 'Escambia' }, geometry: { type: 'Polygon', coordinates: [[[-87.5, 30.5], [-86.5, 30.5], [-86.5, 31.5], [-87.5, 30.5]]] } }] }),
      true,
      'counties.geojson',
    )
    const ds = await dataset('Rates')
    await version(ds.id, 'County,Rate\nEscambia County,12\nElsewhere,3\n', true, 'rates.csv')
    const map = { kind: 'map', chart: undefined, map: { geometry: 'boundaries', boundaryDataset: shapes.id, joinColumn: 'County', boundaryKey: 'NAME', valueColumn: 'Rate', classes: 3 } }
    const v = await viz(ds.id, map)
    const r = await publicRead(v.id)
    expect(r.ok && r.view.model.engine === 'map' && r.view.model.unmatched).toBe(1)
    await expect(viz(ds.id, { ...map, map: { ...map.map, boundaryKey: 'GEOID' } })).rejects.toThrow(/no property "GEOID"/)
  })
})
