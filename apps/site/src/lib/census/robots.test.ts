import { describe, expect, it } from 'vitest'

import { parseRobots } from './robots'

const UA = 'WUWF-migration-research'

describe('parseRobots', () => {
  it('allows everything when the file allows everything', () => {
    const r = parseRobots('User-agent: *\nDisallow:\n', UA)
    expect(r.isAllowed('/a?_renderer=json')).toBe(true)
    expect(r.crawlDelaySeconds).toBeNull()
  })

  it('uses the * group, and blocks what it disallows', () => {
    const r = parseRobots('User-agent: *\nDisallow: /admin\nDisallow: /search', UA)
    expect(r.isAllowed('/admin/x')).toBe(false)
    expect(r.isAllowed('/local-news/2016-05-02/x?_renderer=json')).toBe(true)
  })

  it('prefers a group that names us over *', () => {
    const txt = 'User-agent: *\nDisallow: /\n\nUser-agent: WUWF-migration-research\nDisallow: /private\n'
    const r = parseRobots(txt, UA)
    expect(r.isAllowed('/local-news/x')).toBe(true)
    expect(r.isAllowed('/private/x')).toBe(false)
  })

  it('does not treat someone else\'s group as ours', () => {
    const r = parseRobots('User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow:\n', UA)
    expect(r.isAllowed('/anything')).toBe(true)
  })

  it('lets the longest matching rule win, and Allow win a tie', () => {
    const r = parseRobots('User-agent: *\nDisallow: /local\nAllow: /local-news\nDisallow: /local-news/draft\nAllow: /x\nDisallow: /x', UA)
    expect(r.isAllowed('/local/a')).toBe(false)
    expect(r.isAllowed('/local-news/a')).toBe(true)
    expect(r.isAllowed('/local-news/draft/a')).toBe(false)
    expect(r.isAllowed('/x')).toBe(true)
  })

  it('supports * and $, and sees the query string we will actually send', () => {
    const r = parseRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /*?_renderer=styleguide', UA)
    expect(r.isAllowed('/a/b.pdf')).toBe(false)
    expect(r.isAllowed('/a/b.pdf.html')).toBe(true)
    expect(r.isAllowed('/a?_renderer=styleguide')).toBe(false)
    expect(r.isAllowed('/a?_renderer=json')).toBe(true)
  })

  it('reads Crawl-delay and ignores comments and unknown lines', () => {
    const r = parseRobots('# hi\nUser-agent: *  # all\nCrawl-delay: 7\nSitemap: https://x/s.xml\nDisallow: /a # no\n', UA)
    expect(r.crawlDelaySeconds).toBe(7)
    expect(r.isAllowed('/a')).toBe(false)
  })

  it('treats a file with no groups as allowing everything', () => {
    expect(parseRobots('', UA).isAllowed('/a')).toBe(true)
  })
})
