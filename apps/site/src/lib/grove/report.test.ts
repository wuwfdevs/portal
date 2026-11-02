import { describe, expect, it } from 'vitest'

import { summarize } from './report'
import type { StoryReport } from './types'

const r = (path: string, entries: StoryReport['entries'], mapped: Record<string, number> = {}): StoryReport => ({
  path, groveId: path, mapped, entries,
  status: entries.some((e) => e.level === 'exception') ? 'exception' : entries.some((e) => e.level === 'preserved') ? 'review' : 'clean',
})

describe('the summary of many stories', () => {
  const reports = [
    r('/a', [], { paragraph: 3 }),
    r('/b', [{ level: 'preserved', code: 'embed.host-not-approved', detail: 'embed.documentcloud.org' }, { level: 'preserved', code: 'embed.host-not-approved', detail: 'embed.documentcloud.org' }], { paragraph: 2 }),
    r('/c', [{ level: 'preserved', code: 'embed.host-not-approved', detail: 'storify.com' }, { level: 'exception', code: 'figure.no-image' }]),
    r('/d', [{ level: 'noted', code: 'byline.none' }]),
  ]
  const s = summarize(reports)
  it('counts stories by status and sums what converted', () => {
    expect(s.stories).toBe(4)
    expect(s.byStatus).toEqual({ clean: 2, review: 1, exception: 1 })
    expect(s.mapped).toEqual({ paragraph: 5 })
  })
  it('counts occurrences and stories separately, with examples', () => {
    const c = s.codes.find((x) => x.code === 'embed.host-not-approved')!
    expect(c).toMatchObject({ occurrences: 3, stories: 2, level: 'preserved' })
    expect(c.details).toEqual({ 'embed.documentcloud.org': 2, 'storify.com': 1 })
    expect(c.examples).toEqual(['/b', '/c'])
  })
  it('lists the problems that need a person before the notes', () => {
    expect(s.codes.map((c) => c.level)).toEqual(['exception', 'preserved', 'noted'])
  })
  it('names each host to approve with how many stories it would unblock', () => {
    expect(s.hostsNeedingApproval).toEqual({ 'embed.documentcloud.org': 1, 'storify.com': 1 })
  })
})
