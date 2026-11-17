// Which level a gift lands in and what it comes with. Pure: the levels, their thresholds and every word are the admin's;
// this is only the arithmetic the Give card shows ("At $10 a month: Sustaining Member") so it can be tested on its own.

import { fill } from '@/lib/page-content'

export type Frequency = 'monthly' | 'once'

/** A level as the pages hold it. `minimumMonthly` is the smallest monthly gift in it; a one-time gift counts by the year against the same line. */
export type GivingLevel = {
  name: string
  minimumMonthly: number
  /** What the gift card lists when a gift lands here. `{messages}` becomes the Day Sponsor line for the gift. */
  giftBenefits: string[]
}

/** From this much given in a year, this many short personal messages on the air (Day Sponsor). */
export type MessageTier = { yearly: number; count: number }

/** What a gift comes to in a year: twelve months of a monthly gift, or the gift itself. */
export const yearlyTotal = (amount: number, frequency: Frequency): number => (frequency === 'monthly' ? amount * 12 : amount)

/**
 * The level a gift of this yearly size lands in: the highest whose monthly minimum, over twelve months, it reaches. Anything below
 * the lowest level (a small one-time gift) is still counted in the lowest one, so a gift is never "no level".
 */
export function levelFor<L extends { minimumMonthly: number }>(levels: readonly L[], yearly: number): L | null {
  if (levels.length === 0) return null
  const ordered = [...levels].sort((a, b) => a.minimumMonthly - b.minimumMonthly)
  let found = ordered[0]!
  for (const level of ordered) if (level.minimumMonthly * 12 <= yearly) found = level
  return found
}

/** How many Day Sponsor messages a year of giving earns: the highest tier reached, or none. */
export function messagesFor(tiers: readonly MessageTier[], yearly: number): number {
  let count = 0
  let reached = -1
  for (const tier of tiers) {
    if (tier.yearly <= yearly && tier.yearly > reached) {
      reached = tier.yearly
      count = tier.count
    }
  }
  return count
}

export type MessageWords = { one: string; many: string }

/** "A short personal message" or "3 short personal messages", from the two wordings the admin holds. */
export const messagePhrase = (count: number, words: MessageWords): string => (count === 1 ? words.one : fill(words.many, { count: String(count) }))

/**
 * The lines the gift card lists for a gift. A line that mentions `{messages}` is only listed when the gift earns at least one,
 * so a level never promises a message the amount does not come with.
 */
export function benefitLines(level: GivingLevel | null, messages: number, words: MessageWords): string[] {
  if (!level) return []
  return level.giftBenefits.flatMap((line) => {
    if (!line.includes('{messages}')) return [line]
    return messages > 0 ? [fill(line, { messages: messagePhrase(messages, words) })] : []
  })
}
