import { describe, expect, it } from 'vitest'

import { chooseVersion, VERSION_PROBLEM } from './version'
import { relationId, snapshotOf, specOf, valueFormatOf } from './shape'

describe('which version is drawn', () => {
  const v = (id: number, version: number, published: boolean) => ({ id, version, published })
  const all = [v(1, 1, true), v(2, 2, true), v(3, 3, false)]
  it('follows the newest published version, never a staged one', () => {
    expect(chooseVersion('latest', null, all, false)).toEqual({ ok: true, version: v(2, 2, true) })
  })
  it('a preview follows the newest version, staged or not, so new data can be seen before it is public', () => {
    expect(chooseVersion('latest', null, all, true)).toEqual({ ok: true, version: v(3, 3, false) })
  })
  it('a pinned version is the one named, even when newer ones exist', () => {
    expect(chooseVersion('pinned', 1, all, false)).toEqual({ ok: true, version: v(1, 1, true) })
    expect(chooseVersion('pinned', '1', all, false)).toEqual({ ok: true, version: v(1, 1, true) })
  })
  it('a pinned version that is not published is not drawn for the public, but is in a preview', () => {
    expect(chooseVersion('pinned', 3, all, false)).toEqual({ ok: false, reason: 'pinned-unpublished' })
    expect(chooseVersion('pinned', 3, all, true).ok).toBe(true)
  })
  it('says why when there is nothing to draw', () => {
    expect(chooseVersion('latest', null, [], false)).toEqual({ ok: false, reason: 'none' })
    expect(chooseVersion('latest', null, [v(3, 3, false)], false)).toEqual({ ok: false, reason: 'none-published' })
    expect(chooseVersion('pinned', 9, all, false)).toEqual({ ok: false, reason: 'pinned-missing' })
    expect(chooseVersion('pinned', null, all, false)).toEqual({ ok: false, reason: 'pinned-missing' })
    for (const r of ['none', 'none-published', 'pinned-missing', 'pinned-unpublished'] as const) expect(VERSION_PROBLEM[r]).toBeTruthy()
  })
})

describe('reading a stored record', () => {
  it('finds an id whether the relation is populated or bare, and null when it is gone', () => {
    expect(relationId(4)).toBe(4)
    expect(relationId({ id: 'a' })).toBe('a')
    expect(relationId(null)).toBeNull()
    expect(relationId({})).toBeNull()
  })
  it('builds a chart spec, tolerating missing fields and unknown values', () => {
    const spec = specOf({ kind: 'chart', chart: { type: 'zigzag', x: 'Year', y: ['Cases', '', null], yFormat: { style: 'percent', decimals: 1 } } })
    expect(spec).toMatchObject({ kind: 'chart', type: 'line', x: 'Year', y: ['Cases'], series: null, yFormat: { style: 'percent', decimals: 1 } })
  })
  it('builds map, table and embed specs, and refuses an unknown kind', () => {
    expect(specOf({ kind: 'map', map: { geometry: 'boundaries', joinColumn: 'FIPS', interactive: true, classes: 4 } })).toMatchObject({ geometry: 'boundaries', joinColumn: 'FIPS', interactive: true, classes: 4 })
    expect(specOf({ kind: 'table', table: { columns: [{ column: 'A', label: ' Name ' }, { column: '' }], pageSize: 10 } })).toMatchObject({ columns: [{ column: 'A', label: 'Name', format: null }], pageSize: 10 })
    expect(specOf({ kind: 'embed', embed: { url: ' https://x.org/a ' } })).toEqual({ kind: 'embed', url: 'https://x.org/a', width: null, height: null })
    expect(specOf({ kind: 'sculpture' })).toBeNull()
    expect(specOf(null)).toBeNull()
  })
  it('reads a number format only when it names a style', () => {
    expect(valueFormatOf({})).toBeNull()
    expect(valueFormatOf({ style: 'currency' })).toMatchObject({ style: 'currency' })
  })
  it('builds a dataset snapshot from a stored version, and refuses one with no parsed data', () => {
    const doc = { id: 7, version: 2, label: 'Nov', format: 'csv', columns: [{ name: 'a', type: 'number', empty: 0 }, { name: '', type: 'number' }], data: { rows: [{ a: 1 }], geo: null }, url: '/api/x/file/a.csv', filename: 'a.csv', filesize: 10, publishedAt: '2026-11-01' }
    const s = snapshotOf(doc, { id: 3 })
    expect(s).toMatchObject({ datasetId: 3, versionId: 7, versionNumber: 2, versionLabel: 'Nov', file: { url: '/api/x/file/a.csv', filename: 'a.csv' } })
    expect(s?.table.columns).toHaveLength(1)
    expect(snapshotOf({ id: 1 }, { id: 3 })).toBeNull()
  })
})
