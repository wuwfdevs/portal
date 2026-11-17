// "Start with your goal" (board 16): the admin's goals, plus one built from the events and programs that are open.

import type { Sponsorship } from '@/payload-types'

export type GoalLine = { channel: string; what: string; detail: string; price: string }
export type Goal = { key: string; name: string; title: string; lead: string; total: string; span: string; mix: GoalLine[] }

type Goals = NonNullable<NonNullable<Sponsorship['hub']>['goals']>
const t = (s: string | null | undefined): string => s?.trim() ?? ''

export function goalList(goals: Goals | null | undefined, programs: readonly { name: string; summary: string }[]): Goal[] {
  const out: Goal[] = []
  for (const [i, g] of (goals?.items ?? []).entries()) {
    if (!t(g.name)) continue
    out.push({
      key: g.id ?? `${i}`,
      name: t(g.name),
      title: t(g.title),
      lead: t(g.lead),
      total: t(g.total),
      span: t(g.span),
      mix: (g.lines ?? []).filter((l) => t(l.what)).map((l) => ({ channel: t(l.channel), what: t(l.what), detail: t(l.detail), price: t(l.price) })),
    })
  }
  const e = goals?.eventsGoal
  if (e && t(e.name) && programs.length > 0) {
    out.push({
      key: 'events-and-programs',
      name: t(e.name),
      title: t(e.title),
      lead: t(e.lead),
      total: t(e.total),
      span: t(e.span),
      mix: programs.map((p) => ({ channel: 'Events and programs', what: p.name, detail: p.summary, price: t(e.linePrice) })),
    })
  }
  return out
}
