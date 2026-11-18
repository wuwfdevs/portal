// What the thank-you page may print from its own address. Pure.
//
// The donation form can send a donor back to /support/thanks with the first name, the amount and how often. None of it is stored
// or trusted: each part is read strictly and dropped when it does not look like what it should, so the address cannot be used to
// put a sentence of someone else's choosing in front of a visitor under WUWF's name.

import { fill } from '@/lib/page-content'

import { formatMoney } from './money'
import type { Frequency } from './levels'

export type ThanksGift = { name: string | null; amount: number | null; frequency: Frequency | null }

type Params = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined): string => (Array.isArray(value) ? (value[0] ?? '') : (value ?? '')).trim()

/** A first name: letters (any script), marks, and the spaces, hyphens, apostrophes and periods names use. Short. No digits, no symbols, no web addresses. */
const NAME = /^\p{L}[\p{L}\p{M} '.-]{0,29}$/u

export function readThanks(params: Params): ThanksGift {
  const rawName = first(params.name)
  const rawAmount = first(params.amount)
  const rawFrequency = first(params.frequency).toLowerCase()
  const amount = /^\d{1,6}$/.test(rawAmount) ? Number(rawAmount) : null
  return {
    name: NAME.test(rawName) ? rawName : null,
    amount: amount !== null && amount >= 1 ? amount : null,
    frequency: rawFrequency === 'monthly' || rawFrequency === 'once' ? rawFrequency : null,
  }
}

export type ThanksWords = {
  title: string
  titleNamed: string
  body: string
  bodyMonthly: string
  bodyOnce: string
}

/** The heading and opening paragraph for what is known of the gift. A template whose name or amount is missing is never used. */
export function thanksText(words: ThanksWords, gift: ThanksGift): { title: string; body: string } {
  const title = gift.name && words.titleNamed.trim() ? fill(words.titleNamed, { name: gift.name }) : words.title
  const money = gift.amount ? formatMoney(gift.amount) : null
  const template = money && gift.frequency === 'monthly' && words.bodyMonthly.trim() ? words.bodyMonthly : money && gift.frequency === 'once' && words.bodyOnce.trim() ? words.bodyOnce : words.body
  return { title, body: fill(template, { amount: money ?? '' }) }
}
