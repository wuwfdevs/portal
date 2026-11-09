import { LISTENING_ERROR_CODES } from '@wuwf/portal-contracts'
import { describe, expect, it } from 'vitest'

import { LISTENING_ERROR_MESSAGES, listeningMessage } from './messages'

describe('listening messages', () => {
  it('has a sentence for every code the contract names', () => {
    for (const code of LISTENING_ERROR_CODES) {
      expect(LISTENING_ERROR_MESSAGES[code]).toBeTruthy()
      expect(listeningMessage(code)).toBe(LISTENING_ERROR_MESSAGES[code])
    }
  })

  it('never promises a reply, a date or publication', () => {
    for (const text of Object.values(LISTENING_ERROR_MESSAGES)) {
      expect(text).not.toMatch(/we will (reply|respond|get back|publish|air)|within \d+/i)
    }
  })
})
