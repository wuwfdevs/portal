// The Give card, and the hand-off to WUWF's donation form. Pure.
//
// The site is not the ledger: a gift is made on WUWF's donation form, never here. This builds what the card shows for each choice
// of how often and how much, and the address of the form to go to. Whether that form accepts an amount and a frequency from the
// link is unconfirmed (a test with ?amount=20 did not preselect), so the link carries them only when an editor has said how.

import { isAllowedSupportHref } from '@/lib/support-link'
import { fill } from '@/lib/page-content'

import { formatMoney } from './money'
import { benefitLines, levelFor, messagesFor, yearlyTotal, type Frequency, type GivingLevel, type MessageTier, type MessageWords } from './levels'

export type DonationForm = {
  /** The donation form's address, with the fund and attribution code already in it, for any gift without a form of its own below. */
  address?: string | null
  /** WUWF's donation platform has a separate form for a sustaining (monthly) gift and for a one-time gift: each goes to its own when it has one. */
  monthlyAddress?: string | null
  onceAddress?: string | null
  /** True once someone has confirmed the form reads the amount and frequency from the link. Off, the link carries neither. */
  prefill?: boolean | null
  amountParam?: string | null
  frequencyParam?: string | null
  monthlyValue?: string | null
  onceValue?: string | null
}

/** A query-string name an editor typed: letters, digits and a few separators, nothing that could end the parameter early. */
const PARAM = /^[A-Za-z0-9_.\-[\]]{1,40}$/
const VALUE = /^[A-Za-z0-9_.-]{1,40}$/

/**
 * Where "Give" goes for a chosen gift: the form for its frequency, else the general one. Null when no address is set or it is not one we may
 * link to (so no button is drawn).
 * Parameters already in the address (a fund, an attribution code) are kept; the amount and frequency are added only when
 * `prefill` is on and the names are valid. A whole-dollar amount only; a missing amount sends the frequency alone.
 */
export function donationHref(form: DonationForm | null | undefined, gift?: { amount?: number | null; frequency?: Frequency }): string | null {
  // A form of its own for this frequency wins. If one is typed but is not an address we may link to, there is nothing to link to: falling back
  // to the other form would send a monthly donor to the one-time form (or the reverse).
  const own = (gift?.frequency === 'monthly' ? form?.monthlyAddress : gift?.frequency === 'once' ? form?.onceAddress : null)?.trim()
  const address = own || form?.address?.trim()
  if (!address || !isAllowedSupportHref(address) || address.startsWith('mailto:')) return null
  if (!form?.prefill) return address
  const url = new URL(address, 'https://relative.invalid')
  const amountParam = form.amountParam?.trim()
  const frequencyParam = form.frequencyParam?.trim()
  if (amountParam && PARAM.test(amountParam) && gift?.amount && Number.isFinite(gift.amount) && gift.amount > 0) {
    url.searchParams.set(amountParam, String(Math.round(gift.amount)))
  }
  if (frequencyParam && PARAM.test(frequencyParam) && gift?.frequency) {
    const value = (gift.frequency === 'monthly' ? form.monthlyValue : form.onceValue)?.trim() || gift.frequency
    if (VALUE.test(value)) url.searchParams.set(frequencyParam, value)
  }
  return address.startsWith('/') ? `${url.pathname}${url.search}${url.hash}` : url.toString()
}

export type FrequencyConfig = { key: Frequency; label: string; sub: string; amounts: number[]; defaultAmount: number }

export type DonateConfig = {
  frequencies: FrequencyConfig[]
  otherLabel: string
  /** "At {amount} a month" and "At {amount}". */
  titleMonthly: string
  titleOnce: string
  words: MessageWords
  anyTitle: string
  anyBenefits: string[]
  /** "Give {amount} a month", "Give {amount}", and the label when no amount is chosen. */
  ctaMonthly: string
  ctaOnce: string
  ctaOther: string
  levels: GivingLevel[]
  tiers: MessageTier[]
  form: DonationForm | null | undefined
}

export type DonateOption = {
  key: string
  /** The chip's text: "$10", or the "Other" label. */
  label: string
  amount: number | null
  title: string
  benefits: string[]
  cta: string
  /** Null when there is no form to go to. */
  href: string | null
}

export type DonateFrequency = { key: Frequency; label: string; sub: string; options: DonateOption[]; defaultKey: string }

/** Everything the card shows, for every choice, worked out once on the server so the card itself only keeps track of what is selected. */
export function buildDonateModel(config: DonateConfig): DonateFrequency[] {
  return config.frequencies.map((freq) => {
    const per = freq.key
    const options: DonateOption[] = freq.amounts.map((amount) => {
      const yearly = yearlyTotal(amount, per)
      const level = levelFor(config.levels, yearly)
      const money = formatMoney(amount)
      return {
        key: `${per}-${amount}`,
        label: money,
        amount,
        title: fill(per === 'monthly' ? config.titleMonthly : config.titleOnce, { amount: money }),
        benefits: benefitLines(level, messagesFor(config.tiers, yearly), config.words),
        cta: fill(per === 'monthly' ? config.ctaMonthly : config.ctaOnce, { amount: money }),
        href: donationHref(config.form, { amount, frequency: per }),
      }
    })
    options.push({
      key: `${per}-other`,
      label: config.otherLabel,
      amount: null,
      title: config.anyTitle,
      benefits: config.anyBenefits,
      cta: config.ctaOther,
      href: donationHref(config.form, { frequency: per }),
    })
    const preferred = options.find((o) => o.amount === freq.defaultAmount) ?? options[0]!
    return { key: per, label: freq.label, sub: freq.sub, options, defaultKey: preferred.key }
  })
}
