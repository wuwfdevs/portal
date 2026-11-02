// The census tally: what is in Grove's `?_renderer=json` pages, counted without keeping the pages.
//
// Pure and structure-agnostic on purpose. The first sample's responses are gone and its field names are known only
// from the ROADMAP's prose, so nothing here assumes a name like `Enhancement`: any object that carries one of the
// label keys below is a "typed" object and gets a shape (label + its keys and the kind of each value).
// Names the ROADMAP does give (`_template`, `contentId`, `sourceOrganizationName`, `canonicalLink`) are looked up
// by key anywhere in the document; where a name is only a guess (published date, primary section) the key that
// matched is recorded, so a wrong guess shows up in the output instead of hiding.

import { createHash } from 'node:crypto'

export type Kind = 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object'
export type OriginClass = 'wuwf' | 'external' | 'ambiguous'

export interface Counted {
  count: number
  examples: string[]
}

export interface ShapeEntry extends Counted {
  label: string
  keys: Record<string, Kind>
}

export interface GroupTally {
  pages: number
  templates: Record<string, Counted>
  typeLabels: Record<string, Counted>
  shapes: Record<string, ShapeEntry>
  keyPaths: Record<string, Counted>
  htmlTags: Record<string, number>
  htmlClasses: Record<string, number>
  urlHosts: Record<string, number>
  origin: {
    byClass: Record<string, number>
    canonicalHosts: Record<string, number>
    organizations: Record<string, number>
    disagreements: Counted
    withContentId: number
    withNprId: number
  }
  dates: {
    publishedKeys: Record<string, number>
    pathDateMatches: Record<'both' | 'chicago-only' | 'utc-only' | 'neither' | 'unknown', number>
  }
  sections: {
    primaryKeys: Record<string, number>
    pathSectionInPrimary: Record<'yes' | 'no' | 'unknown', number>
  }
  /** "category:name" -> the 1-based index (within this group) of the page that first showed it. */
  firstSeen: Record<string, number>
  overflow: { shapes: number; keyPaths: number }
}

export interface Tally {
  version: 1
  groups: Record<string, GroupTally>
}

export interface PageFacts {
  template: string | null
  publishedAt: string | null
  origin: OriginClass
  canonicalHost: string | null
  organization: string | null
  contentId: string | null
}

const LABEL_KEYS = ['_template', 'class', '_type', 'type', '__typename'] as const
const MAX_EXAMPLES = 3
const MAX_SHAPES = 5000
const MAX_KEYPATHS = 20000
const MAX_WIDE_KEYS = 60
const MAX_DEPTH = 40
const WUWF_HOSTS = new Set(['www.wuwf.org', 'wuwf.org'])

export function emptyTally(): Tally {
  return { version: 1, groups: {} }
}

function emptyGroup(): GroupTally {
  return {
    pages: 0,
    templates: {},
    typeLabels: {},
    shapes: {},
    keyPaths: {},
    htmlTags: {},
    htmlClasses: {},
    urlHosts: {},
    origin: { byClass: {}, canonicalHosts: {}, organizations: {}, disagreements: { count: 0, examples: [] }, withContentId: 0, withNprId: 0 },
    dates: {
      publishedKeys: {},
      pathDateMatches: { both: 0, 'chicago-only': 0, 'utc-only': 0, neither: 0, unknown: 0 },
    },
    sections: { primaryKeys: {}, pathSectionInPrimary: { yes: 0, no: 0, unknown: 0 } },
    firstSeen: {},
    overflow: { shapes: 0, keyPaths: 0 },
  }
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1
}

function bumpCounted(map: Record<string, Counted>, key: string, example: string): void {
  const e = (map[key] ??= { count: 0, examples: [] })
  e.count++
  if (e.examples.length < MAX_EXAMPLES && !e.examples.includes(example)) e.examples.push(example)
}

const kindOf = (v: unknown): Kind => (v === null ? 'null' : Array.isArray(v) ? 'array' : (typeof v as Kind))

function labelOf(obj: Record<string, unknown>): string | null {
  for (const k of LABEL_KEYS) {
    const v = obj[k]
    if (typeof v === 'string' && v.length > 0 && v.length <= 200) return v
  }
  return null
}

function shapeId(label: string, keys: Record<string, Kind>): string {
  const sig = Object.keys(keys)
    .sort()
    .map((k) => `${k}:${keys[k]}`)
    .join(',')
  return `${label}#${createHash('sha1').update(sig).digest('hex').slice(0, 8)}`
}

function noteFirst(g: GroupTally, category: string, name: string): void {
  const k = `${category}:${name}`
  if (g.firstSeen[k] === undefined) g.firstSeen[k] = g.pages
}

interface Seen {
  keyPaths: Set<string>
  htmlTags: Set<string>
  htmlClasses: Set<string>
  hosts: Set<string>
  labels: Set<string>
  shapes: Set<string>
}

function scanHtml(s: string, seen: Seen): void {
  if (!/<[a-zA-Z][^>]*>/.test(s)) return
  for (const m of s.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)/g)) seen.htmlTags.add((m[1] as string).toLowerCase())
  for (const m of s.matchAll(/class\s*=\s*"([^"]*)"/g)) for (const c of (m[1] as string).split(/\s+/)) if (c) seen.htmlClasses.add(c)
  for (const m of s.matchAll(/\bsrc\s*=\s*"(https?:\/\/([^"/\s]+))/gi)) seen.hosts.add((m[2] as string).toLowerCase())
}

function walk(node: unknown, path: string, depth: number, seen: Seen): void {
  if (depth > MAX_DEPTH) return
  if (typeof node === 'string') {
    const m = /^https?:\/\/([^/\s]+)\S*$/i.exec(node)
    if (m) seen.hosts.add((m[1] as string).toLowerCase())
    else scanHtml(node, seen)
    return
  }
  if (Array.isArray(node)) {
    for (const item of node) walk(item, `${path}[]`, depth + 1, seen)
    return
  }
  if (node === null || typeof node !== 'object') return
  const obj = node as Record<string, unknown>
  const keys = Object.keys(obj)
  const label = labelOf(obj)
  if (label !== null) {
    // The page's own template is counted as a template; counting it again as a label would double every new template.
    if (!(depth === 0 && obj['_template'] === label)) seen.labels.add(label)
    const kinds: Record<string, Kind> = {}
    if (keys.length > MAX_WIDE_KEYS) kinds['(wide object)'] = 'object'
    else for (const k of keys) kinds[k] = kindOf(obj[k])
    seen.shapes.add(`${label}\u0000${JSON.stringify(kinds)}`)
  }
  for (const k of keys) {
    const p = path ? `${path}.${k}` : k
    seen.keyPaths.add(p)
    walk(obj[k], p, depth + 1, seen)
  }
}

function findFirst(node: unknown, test: (key: string, value: unknown) => boolean, depth = 0): { key: string; value: unknown } | null {
  if (depth > MAX_DEPTH || node === null || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const r = findFirst(item, test, depth + 1)
      if (r) return r
    }
    return null
  }
  const obj = node as Record<string, unknown>
  for (const k of Object.keys(obj)) if (test(k, obj[k]) && obj[k] !== null && obj[k] !== undefined && obj[k] !== '') return { key: k, value: obj[k] }
  for (const k of Object.keys(obj)) {
    const r = findFirst(obj[k], test, depth + 1)
    if (r) return r
  }
  return null
}

const asText = (v: unknown): string | null => {
  if (typeof v === 'string') return v.trim().slice(0, 120) || null
  if (typeof v === 'number') return String(v)
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    for (const k of ['name', 'displayName', 'title', 'label', 'slug']) if (typeof o[k] === 'string') return (o[k] as string).slice(0, 120)
    return JSON.stringify(v).slice(0, 120)
  }
  return null
}

export function classifyOrigin(input: { organization: string | null; canonicalHost: string | null }): OriginClass {
  const { organization, canonicalHost } = input
  if (!canonicalHost) return 'ambiguous'
  if (!WUWF_HOSTS.has(canonicalHost)) return 'external'
  // Canonical on our own host: ours, unless the story names another organization (WUWF-hosted syndicated copy).
  if (organization && !/wuwf/i.test(organization)) return 'ambiguous'
  return 'wuwf'
}

/** Raw JSON is kept for WUWF and unclear pages only; NPR and wire pages keep a manifest row and nothing else. */
export const shouldKeepRaw = (origin: OriginClass): boolean => origin !== 'external'

const chicagoDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' })

function compareDates(pathDate: string | undefined, published: string | null): 'both' | 'chicago-only' | 'utc-only' | 'neither' | 'unknown' {
  if (!pathDate || !published || !/^\d{4}-\d{2}-\d{2}T/.test(published)) return 'unknown'
  const d = new Date(published)
  if (Number.isNaN(d.getTime())) return 'unknown'
  const utc = d.toISOString().slice(0, 10) === pathDate
  const chi = chicagoDate.format(d) === pathDate
  return utc && chi ? 'both' : chi ? 'chicago-only' : utc ? 'utc-only' : 'neither'
}

const slugify = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export interface PagePathInfo {
  date?: string
  section?: string
}

/** Add one page. Returns the facts the manifest row needs. Never throws on odd JSON. */
export function addPage(tally: Tally, group: string, pagePath: string, json: unknown, pathInfo: PagePathInfo = {}): PageFacts {
  const g = (tally.groups[group] ??= emptyGroup())
  g.pages++

  const seen: Seen = { keyPaths: new Set(), htmlTags: new Set(), htmlClasses: new Set(), hosts: new Set(), labels: new Set(), shapes: new Set() }
  walk(json, '', 0, seen)

  const root = json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : {}
  const template = typeof root['_template'] === 'string' ? (root['_template'] as string) : null
  if (template !== null) {
    bumpCounted(g.templates, template, pagePath)
    noteFirst(g, 'template', template)
  } else {
    bumpCounted(g.templates, '(no _template)', pagePath)
  }

  for (const label of [...seen.labels].sort()) {
    bumpCounted(g.typeLabels, label, pagePath)
    noteFirst(g, 'label', label)
  }
  for (const s of [...seen.shapes].sort()) {
    const [label, kindsJson] = s.split('\u0000') as [string, string]
    const keys = JSON.parse(kindsJson) as Record<string, Kind>
    const id = shapeId(label, keys)
    if (!g.shapes[id] && Object.keys(g.shapes).length >= MAX_SHAPES) {
      g.overflow.shapes++
      continue
    }
    const e = (g.shapes[id] ??= { label, keys, count: 0, examples: [] })
    e.count++
    if (e.examples.length < MAX_EXAMPLES && !e.examples.includes(pagePath)) e.examples.push(pagePath)
    noteFirst(g, 'shape', id)
  }
  for (const p of [...seen.keyPaths].sort()) {
    if (!g.keyPaths[p] && Object.keys(g.keyPaths).length >= MAX_KEYPATHS) {
      g.overflow.keyPaths++
      continue
    }
    bumpCounted(g.keyPaths, p, pagePath)
  }
  for (const t of seen.htmlTags) bump(g.htmlTags, t)
  for (const c of seen.htmlClasses) bump(g.htmlClasses, c)
  for (const h of seen.hosts) bump(g.urlHosts, h)

  // Origin: several signals, never the path (the plan, section 3).
  const canonical = findFirst(json, (k) => k === 'canonicalLink')
  const org = findFirst(json, (k) => k === 'sourceOrganizationName')
  const idHit = findFirst(json, (k) => k === 'contentId')
  let canonicalHost: string | null = null
  let nprId = false
  if (canonical && typeof canonical.value === 'string') {
    try {
      canonicalHost = new URL(canonical.value).hostname.toLowerCase()
    } catch {
      canonicalHost = null
    }
    nprId = /nx-s\d+-\d+|\/\d{7,}(?:\/|$)/.test(canonical.value) && canonicalHost !== null && !WUWF_HOSTS.has(canonicalHost)
  }
  const organization = org ? asText(org.value) : null
  const contentId = idHit ? asText(idHit.value) : null
  const origin = classifyOrigin({ organization, canonicalHost })
  bump(g.origin.byClass, origin)
  bump(g.origin.canonicalHosts, canonicalHost ?? '(none)')
  bump(g.origin.organizations, organization ?? '(none)')
  if (contentId) g.origin.withContentId++
  if (nprId) g.origin.withNprId++
  if (origin === 'ambiguous') {
    g.origin.disagreements.count++
    if (g.origin.disagreements.examples.length < MAX_EXAMPLES) g.origin.disagreements.examples.push(pagePath)
  }

  // Published date and the path's date. Key name is a guess, so the key that matched is recorded.
  const pub = findFirst(json, (k, v) => /publish/i.test(k) && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v))
  let published: string | null = null
  if (pub && typeof pub.value === 'string') {
    published = pub.value
    bump(g.dates.publishedKeys, pub.key)
  } else bump(g.dates.publishedKeys, '(none found)')
  bump(g.dates.pathDateMatches, compareDates(pathInfo.date, published))

  // Does the path's section appear in the page's primary section? (Key name is a guess; recorded.)
  const prim = findFirst(json, (k) => /primary.*section|section.*primary/i.test(k))
  if (prim && pathInfo.section) {
    bump(g.sections.primaryKeys, prim.key)
    const text = slugify(JSON.stringify(prim.value))
    bump(g.sections.pathSectionInPrimary, text.includes(slugify(pathInfo.section)) ? 'yes' : 'no')
  } else {
    bump(g.sections.primaryKeys, '(none found)')
    bump(g.sections.pathSectionInPrimary, 'unknown')
  }

  return { template, publishedAt: published, origin, canonicalHost, organization, contentId }
}

/** How many new templates / type labels / shapes each further `step` pages found. */
export function discoveryCurve(g: GroupTally, step = 100): Array<{ upToPage: number; templates: number; labels: number; shapes: number }> {
  const buckets = new Map<number, { templates: number; labels: number; shapes: number }>()
  for (const [key, page] of Object.entries(g.firstSeen)) {
    const b = Math.ceil(page / step)
    const e = buckets.get(b) ?? { templates: 0, labels: 0, shapes: 0 }
    if (key.startsWith('template:')) e.templates++
    else if (key.startsWith('label:')) e.labels++
    else if (key.startsWith('shape:')) e.shapes++
    buckets.set(b, e)
  }
  const last = Math.ceil(g.pages / step)
  const out = []
  for (let b = 1; b <= last; b++) out.push({ upToPage: Math.min(b * step, g.pages), ...(buckets.get(b) ?? { templates: 0, labels: 0, shapes: 0 }) })
  return out
}
