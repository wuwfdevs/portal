// Links inside a migrated story that point at pages this site will not have. Pure: it reads a finished story body and a
// map someone else built (`scripts/grove/resolve-links.ts`), and returns a new body. It fetches nothing.
//
// Why it exists: a wire story is not archived here (it answers 410), and Grove still answers an old `/post/<slug>` address with a
// 301 to the story's current one. A migrated story that links to either would carry a link that works on Grove and fails here.
// So each such link is pointed at the original publisher or the story's new address, or removed (its words stay).

import * as lex from './lexical'
import type { LexNode, LexicalState } from './types'

/** Where a link should go instead: an address, or `null` for "remove the link and keep its words". Keyed by the path alone. */
export type LinkMap = Readonly<Record<string, string | null>>

export type LinkKind = 'wire' | 'legacy-post' | 'section-story' | 'show-episode' | 'page'

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** The path of a link on this site (no query, fragment or trailing slash), or null when the link is not a path on this site. */
export function linkPath(url: unknown): string | null {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return null
  const path = url.replace(/[?#].*$/, '')
  return path.length > 1 ? path.replace(/\/$/, '') : path
}

/** What kind of page an own-site path names, by its shape alone (Grove's exact shapes; see ROADMAP, *URL scheme*). */
export function linkKind(path: string): LinkKind {
  const seg = path.split('/').filter(Boolean)
  if (seg[0] === 'post' && seg.length === 2) return 'legacy-post'
  if (seg.length === 2 && DATE.test(seg[0]!)) return 'wire'
  if (seg.length === 3 && DATE.test(seg[1]!)) return 'section-story'
  if ((seg[0] === 'show' || seg[0] === 'podcast') && seg.length === 4 && DATE.test(seg[2]!)) return 'show-episode'
  return 'page'
}

type Visit = (node: LexNode) => void
function walk(nodes: readonly LexNode[], visit: Visit): void {
  for (const n of nodes) {
    visit(n)
    if (Array.isArray(n.children)) walk(n.children as LexNode[], visit)
  }
}

const fieldsOf = (n: LexNode): Record<string, unknown> => (n.fields && typeof n.fields === 'object' ? (n.fields as Record<string, unknown>) : {})

/** Every distinct own-site path that a link or a link line in the body points at, in order of first use. */
export function internalLinks(state: LexicalState): string[] {
  const out = new Set<string>()
  walk(state.root.children, (n) => {
    const f = fieldsOf(n)
    const url = n.type === 'link' ? f.url : n.type === 'block' && f.blockType === 'linkLine' ? f.url : undefined
    const p = linkPath(url)
    if (p) out.add(p)
  })
  return [...out]
}

export interface LinkChange {
  from: string
  /** The new address, or null when the link was removed. */
  to: string | null
  /** A link line (label plus link) rather than a link in a sentence. */
  line?: boolean
}

export interface AppliedLinks {
  state: LexicalState
  changes: LinkChange[]
}

/**
 * Returns the body with each mapped link changed. A link in a sentence that maps to `null` loses the link and keeps its words; a link
 * line that maps to `null` becomes a plain paragraph of its label and link text, so no words are lost. Anything not in the map is left
 * exactly as it was. The input is not modified.
 */
export function applyLinkMap(state: LexicalState, map: LinkMap): AppliedLinks {
  const changes: LinkChange[] = []
  const mapped = (url: unknown): { path: string; to: string | null } | null => {
    const path = linkPath(url)
    return path !== null && Object.hasOwn(map, path) ? { path, to: map[path] ?? null } : null
  }
  const visit = (nodes: readonly LexNode[]): LexNode[] =>
    nodes.flatMap((n): LexNode[] => {
      const f = fieldsOf(n)
      if (n.type === 'link') {
        const m = mapped(f.url)
        if (m) {
          changes.push({ from: m.path, to: m.to })
          if (m.to === null) return visit((n.children as LexNode[]) ?? [])
          return [{ ...n, fields: { ...f, url: m.to }, children: visit((n.children as LexNode[]) ?? []) }]
        }
      }
      if (n.type === 'block' && f.blockType === 'linkLine') {
        const m = mapped(f.url)
        if (m) {
          changes.push({ from: m.path, to: m.to, line: true })
          if (m.to !== null) return [{ ...n, fields: { ...f, url: m.to } }]
          const words = [f.label, f.linkText].filter((x): x is string => typeof x === 'string' && x !== '').join(' ')
          return [lex.paragraph(words ? [lex.text(words)] : [])]
        }
      }
      return Array.isArray(n.children) ? [{ ...n, children: visit(n.children as LexNode[]) }] : [n]
    })
  return { state: { root: { ...state.root, children: visit(state.root.children) } }, changes }
}
