import { describe, expect, it } from 'vitest'

import { redirects } from '../../redirects'

describe('static redirects', () => {
  it('sends Grove\'s old donation page to the Support page, temporarily so it can be repointed later', async () => {
    const all = await redirects!()
    expect(all).toContainEqual({ source: '/thanks-for-your-support', destination: '/support', permanent: false })
  })
  it('keeps the incompatible-browser redirect, and puts the specific redirect ahead of its catch-all', async () => {
    const all = await redirects!()
    expect(all.findIndex((r) => r.source === '/thanks-for-your-support')).toBeLessThan(all.findIndex((r) => r.destination === '/ie-incompatible.html'))
  })
})
