// Many reports to one summary: what the whole corpus did, what needs a person, which hosts need approving.

import type { ReportLevel, StoryReport } from './types'

export interface CodeSummary {
  code: string
  level: ReportLevel
  occurrences: number
  stories: number
  details: Record<string, number>
  examples: string[]
}

export interface Summary {
  stories: number
  byStatus: Record<StoryReport['status'], number>
  mapped: Record<string, number>
  codes: CodeSummary[]
  /** Hosts a frame came from that the site does not approve, with the number of stories each would affect. */
  hostsNeedingApproval: Record<string, number>
}

export function summarize(reports: readonly StoryReport[]): Summary {
  const byStatus: Summary['byStatus'] = { clean: 0, review: 0, exception: 0 }
  const mapped: Record<string, number> = {}
  const codes = new Map<string, CodeSummary & { seen: Set<string> }>()
  const hosts = new Map<string, Set<string>>()
  for (const r of reports) {
    byStatus[r.status]++
    for (const [k, n] of Object.entries(r.mapped)) mapped[k] = (mapped[k] ?? 0) + n
    for (const e of r.entries) {
      let c = codes.get(e.code)
      if (!c) codes.set(e.code, (c = { code: e.code, level: e.level, occurrences: 0, stories: 0, details: {}, examples: [], seen: new Set() }))
      c.occurrences++
      if (!c.seen.has(r.path)) {
        c.seen.add(r.path)
        c.stories++
        if (c.examples.length < 3) c.examples.push(r.path)
      }
      if (e.detail) c.details[e.detail] = (c.details[e.detail] ?? 0) + 1
      if (e.code === 'embed.host-not-approved' && e.detail) (hosts.get(e.detail) ?? hosts.set(e.detail, new Set()).get(e.detail)!).add(r.path)
    }
  }
  const rank: Record<ReportLevel, number> = { exception: 0, preserved: 1, noted: 2 }
  return {
    stories: reports.length,
    byStatus,
    mapped,
    codes: [...codes.values()].map(({ seen: _s, ...c }) => c).sort((a, b) => rank[a.level] - rank[b.level] || b.stories - a.stories),
    hostsNeedingApproval: Object.fromEntries([...hosts].map(([h, s]) => [h, s.size]).sort((a, b) => (b[1] as number) - (a[1] as number))),
  }
}
