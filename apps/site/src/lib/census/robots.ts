// robots.txt, read honestly: the group that names us, else `*`; the longest matching rule wins; Allow wins a tie.

export interface RobotsPolicy {
  /** `pathAndQuery` is what will actually be requested, e.g. `/local-news/2016-05-02/x?_renderer=json`. */
  isAllowed(pathAndQuery: string): boolean
  /** Seconds, if the file asks for one. */
  crawlDelaySeconds: number | null
}

interface Rule {
  allow: boolean
  pattern: string
}

interface Group {
  agents: string[]
  rules: Rule[]
  crawlDelay: number | null
}

function parseGroups(text: string): Group[] {
  const groups: Group[] = []
  let current: Group | null = null
  let lastWasAgent = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const field = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelay: null }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (!current) continue
    if (field === 'allow') current.rules.push({ allow: true, pattern: value })
    else if (field === 'disallow') current.rules.push({ allow: false, pattern: value })
    else if (field === 'crawl-delay') {
      const n = Number(value)
      if (Number.isFinite(n) && n >= 0) current.crawlDelay = n
    }
  }
  return groups
}

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith('$')
  const body = (anchored ? pattern.slice(0, -1) : pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${body}${anchored ? '$' : ''}`)
}

export function parseRobots(text: string, agent: string): RobotsPolicy {
  const groups = parseGroups(text)
  const me = agent.toLowerCase()
  // A group names us if one of its agent tokens appears in our agent string; the longest such token wins.
  let best: { group: Group; len: number } | null = null
  for (const g of groups) {
    for (const a of g.agents) {
      if (a !== '*' && me.includes(a) && (!best || a.length > best.len)) best = { group: g, len: a.length }
    }
  }
  const group = best?.group ?? groups.find((g) => g.agents.includes('*')) ?? null
  const rules = (group?.rules ?? []).filter((r) => r.pattern !== '')
  const compiled = rules.map((r) => ({ ...r, re: patternToRegex(r.pattern) }))

  return {
    crawlDelaySeconds: group?.crawlDelay ?? null,
    isAllowed(pathAndQuery: string): boolean {
      let winner: { allow: boolean; len: number } | null = null
      for (const r of compiled) {
        if (!r.re.test(pathAndQuery)) continue
        const len = r.pattern.length
        if (!winner || len > winner.len || (len === winner.len && r.allow)) winner = { allow: r.allow, len }
      }
      return winner ? winner.allow : true
    },
  }
}
