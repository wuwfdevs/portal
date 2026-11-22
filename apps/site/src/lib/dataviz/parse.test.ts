import { describe, expect, it } from 'vitest'

import { parseCsv, sniffDelimiter } from './csv'
import { cleanHeaders, formatFromFilename, inferType, parseDataset } from './parse'
import { MAX_ROWS } from './types'

describe('csv reader', () => {
  it('reads quoted fields, doubled quotes, embedded commas and line breaks', () => {
    const r = parseCsv('a,b\r\n"x, y","say ""hi"""\r\n"line\nbreak",3\n')
    expect(r).toEqual({ ok: true, records: [['a', 'b'], ['x, y', 'say "hi"'], ['line\nbreak', '3']] })
  })
  it('ignores a byte-order mark and blank lines, and keeps a last row with no newline', () => {
    const r = parseCsv('﻿a,b\n\n1,2')
    expect(r).toEqual({ ok: true, records: [['a', 'b'], ['1', '2']] })
  })
  it('sniffs tabs and semicolons, but not a comma inside quotes', () => {
    expect(sniffDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t')
    expect(sniffDelimiter('a;b\n1;2')).toBe(';')
    expect(sniffDelimiter('"a,b";c\n')).toBe(';')
  })
  it('refuses a quote that never closes', () => {
    expect(parseCsv('a,b\n"oops,1')).toMatchObject({ ok: false })
  })
})

describe('column types', () => {
  it('knows numbers (with thousands separators), dates, booleans and text; empty cells do not vote', () => {
    expect(inferType(['1', '2,500', '', 'NA', '3.5'])).toBe('number')
    expect(inferType(['2024-01-05', '2024-02-01'])).toBe('date')
    expect(inferType(['true', 'FALSE'])).toBe('boolean')
    expect(inferType(['1', 'two'])).toBe('string')
    expect(inferType(['', 'n/a'])).toBe('string')
  })
  it('does not call a ZIP code with a leading zero a harmless number, but does keep 0 and negatives', () => {
    expect(inferType(['-4', '0', '+7'])).toBe('number')
    expect(inferType(['12-3'])).toBe('string')
  })
  it('names blank and repeated headings so every column can be chosen', () => {
    expect(cleanHeaders(['A', '', 'A', ' B '])).toEqual(['A', 'Column 2', 'A (2)', 'B'])
  })
})

describe('parseDataset: csv', () => {
  it('builds typed rows and counts empty cells', () => {
    const r = parseDataset('csv', 'County,Cases,Day\nEscambia,"1,200",2024-03-05\nSanta Rosa,,2024-03-06\n')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.dataset.table.columns).toEqual([
      { name: 'County', type: 'string', empty: 0 },
      { name: 'Cases', type: 'number', empty: 1 },
      { name: 'Day', type: 'date', empty: 0 },
    ])
    expect(r.dataset.table.rows[0]).toEqual({ County: 'Escambia', Cases: 1200, Day: '2024-03-05' })
    expect(r.dataset.table.rows[1]!.Cases).toBeNull()
  })
  it('refuses a row with more values than the header and says which row', () => {
    const r = parseDataset('csv', 'a,b\n1,2\n3,4,5\n')
    expect(r).toMatchObject({ ok: false })
    expect(!r.ok && r.reason).toMatch(/Row 3/)
  })
  it('refuses an empty file, a file with no rows, and too many rows', () => {
    expect(parseDataset('csv', '')).toMatchObject({ ok: false })
    expect(parseDataset('csv', 'a,b\n')).toMatchObject({ ok: false })
    const big = `a\n${Array.from({ length: MAX_ROWS + 1 }, (_, i) => i).join('\n')}`
    const r = parseDataset('csv', big)
    expect(!r.ok && r.reason).toMatch(/rows/)
  })
})

describe('parseDataset: json', () => {
  it('reads an array of objects, taking the union of the keys', () => {
    const r = parseDataset('json', JSON.stringify([{ a: 1, b: 'x' }, { a: 2, c: true }]))
    expect(r.ok && r.dataset.table.columns.map((c) => [c.name, c.type])).toEqual([['a', 'number'], ['b', 'string'], ['c', 'boolean']])
  })
  it('reads a wrapper object with a data list', () => {
    expect(parseDataset('json', '{"data":[{"a":1}]}')).toMatchObject({ ok: true })
  })
  it('explains what shape it wants when it is something else', () => {
    expect(parseDataset('json', '{"a":1}')).toMatchObject({ ok: false })
    expect(parseDataset('json', '[1,2]')).toMatchObject({ ok: false })
    expect(parseDataset('json', '{oops')).toMatchObject({ ok: false })
  })
  it('turns a nested value into text rather than losing it', () => {
    const r = parseDataset('json', '[{"a":{"b":1}}]')
    expect(r.ok && r.dataset.table.rows[0]!.a).toBe('{"b":1}')
  })
  it('recognises GeoJSON in a .json file', () => {
    const r = parseDataset('json', '{"type":"Feature","geometry":{"type":"Point","coordinates":[-87,30]},"properties":{"n":1}}')
    expect(r.ok && r.dataset.format).toBe('geojson')
  })
})

describe('parseDataset: geojson', () => {
  const fc = (coords: unknown) => JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'A', n: 3 }, geometry: { type: 'Point', coordinates: coords } }] })
  it('keeps the geometry and makes a table of the properties, row i for feature i', () => {
    const r = parseDataset('geojson', fc([-87.2, 30.4]))
    expect(r.ok && r.dataset.geo?.features).toHaveLength(1)
    expect(r.ok && r.dataset.table.rows).toEqual([{ name: 'A', n: 3 }])
  })
  it('catches coordinates that are not on the globe: a latitude past 90, or a projected coordinate system', () => {
    const r = parseDataset('geojson', fc([-87.2, 130]))
    expect(r).toMatchObject({ ok: false })
    expect(parseDataset('geojson', fc([500000, 3000000]))).toMatchObject({ ok: false })
  })
  it('refuses what is not GeoJSON', () => {
    expect(parseDataset('geojson', '{"type":"Topology"}')).toMatchObject({ ok: false })
  })
})

describe('file names', () => {
  it('maps extensions to formats', () => {
    expect(formatFromFilename('a.CSV')).toBe('csv')
    expect(formatFromFilename('a.geojson')).toBe('geojson')
    expect(formatFromFilename('a.json')).toBe('json')
    expect(formatFromFilename('a.xlsx')).toBeNull()
  })
})
