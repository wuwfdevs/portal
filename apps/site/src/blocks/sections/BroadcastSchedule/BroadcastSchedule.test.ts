import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WeekScheduleData } from '@/lib/live/week'

import { testContext } from '../testing'
import { BroadcastScheduleSection, BroadcastScheduleView } from './Component'

let week: WeekScheduleData | null = null
const loadWeekSchedule = vi.fn(async () => week)
vi.mock('@/lib/live/week', () => ({ loadWeekSchedule: () => loadWeekSchedule() }))
// The week itself follows the player's channel, which a test has no provider for: the band around it is what this block owns.
vi.mock('@/components/ListenLive/WeekSchedule', () => ({
  WeekSchedule: ({ today, days }: { today: string; days: string[] }) => createElement('p', { 'data-testid': 'week' }, `${days.length} days, today ${today}`),
}))

const data: WeekScheduleData = { weeks: { main: [] }, days: ['2026-12-01', '2026-12-02'], today: '2026-12-01' }
const draw = async (block: Record<string, unknown>) => {
  const out = await BroadcastScheduleSection({ block: { blockType: 'sectionBroadcastSchedule', ...block } as never, context: testContext })
  return out ? renderToStaticMarkup(out as never) : ''
}
beforeEach(() => {
  week = null
  loadWeekSchedule.mockClear()
})

describe('Broadcast schedule section', () => {
  it('draws nothing when no stream is set up', async () => {
    expect(await draw({})).toBe('')
  })
  it('draws the week in a band with its heading, tone and anchor', async () => {
    week = data
    const html = await draw({ tone: 'grey', anchor: 'schedule', heading: { title: 'Schedule' } })
    expect(html).toContain('2 days, today 2026-12-01')
    expect(html).toContain('Schedule')
    expect(html).toContain('data-tone="grey"')
    expect(html).toContain('id="schedule"')
  })
  it('the view draws the same band from a loaded week', () => {
    const html = renderToStaticMarkup(createElement(BroadcastScheduleView, { block: { blockType: 'sectionBroadcastSchedule' }, week: data }))
    expect(html).toContain('data-section="sectionBroadcastSchedule"')
  })
})
