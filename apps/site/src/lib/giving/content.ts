// The Giving pages global as the pages read it. Pure: shapes and small conversions over what the admin holds. Nothing here is copy,
// apart from the placeholders a template needs to still make sense when an editor clears it.

import type { SupportPage } from '@/payload-types'

import { textsOf } from '@/lib/page-content'

import type { DonateConfig } from './donate'
import type { GivingLevel, MessageTier } from './levels'
import type { WayGroup, WayPanel } from './ways'

export type GivingContent = SupportPage

/** A level with everything a page draws, in the order of the monthly minimum. */
export type LevelView = GivingLevel & {
  id: string
  /** The range as printed above the name: "$10 a month or more". */
  amount: string
  description: string
  benefits: string[]
  emphasis: 'standard' | 'featured' | 'leadership'
}

type RawLevel = NonNullable<SupportPage['levels']>[number]

/** The levels an editor has completed (a name and a monthly minimum), lowest first. A half-filled row is left out, never drawn broken. */
export function levelViews(levels: readonly RawLevel[] | null | undefined): LevelView[] {
  return (levels ?? [])
    .flatMap((l) => {
      const name = l.name?.trim()
      const minimumMonthly = typeof l.minimumMonthly === 'number' && l.minimumMonthly > 0 ? l.minimumMonthly : null
      if (!name || minimumMonthly === null) return []
      return [
        {
          id: l.id ?? name,
          name,
          amount: l.amount?.trim() ?? '',
          description: l.description?.trim() ?? '',
          minimumMonthly,
          benefits: textsOf(l.benefits, 'text'),
          giftBenefits: textsOf(l.giftBenefits, 'text'),
          emphasis: l.emphasis ?? 'standard',
        } satisfies LevelView,
      ]
    })
    .sort((a, b) => a.minimumMonthly - b.minimumMonthly)
}

export function tiersOf(rows: SupportPage['messageTiers']): MessageTier[] {
  return (rows ?? []).flatMap((t) => (typeof t.yearly === 'number' && typeof t.count === 'number' && t.yearly > 0 && t.count > 0 ? [{ yearly: t.yearly, count: t.count }] : []))
}

/** Whole-dollar amounts an editor listed: positive, once each, smallest first. */
const amountsOf = (rows: readonly { amount?: number | null }[] | null | undefined): number[] =>
  [...new Set((rows ?? []).flatMap((r) => (typeof r.amount === 'number' && r.amount > 0 ? [Math.round(r.amount)] : [])))].sort((a, b) => a - b)

/**
 * What the Give card needs, or null when it has nothing to offer (no amounts at all). Wording that carries a placeholder falls back to
 * the plain template, so clearing a field in the admin cannot leave "At  a month" on the page.
 */
export function donateConfigOf(content: GivingContent): DonateConfig | null {
  const card = content.give?.card
  const monthly = amountsOf(card?.monthlyAmounts)
  const once = amountsOf(card?.onceAmounts)
  const frequencies: DonateConfig['frequencies'] = [
    ...(monthly.length ? [{ key: 'monthly' as const, label: card?.monthlyLabel?.trim() || 'Monthly', sub: card?.monthlySub?.trim() ?? '', amounts: monthly, defaultAmount: card?.monthlyDefault ?? monthly[0]! }] : []),
    ...(once.length ? [{ key: 'once' as const, label: card?.onceLabel?.trim() || 'One time', sub: card?.onceSub?.trim() ?? '', amounts: once, defaultAmount: card?.onceDefault ?? once[0]! }] : []),
  ]
  if (frequencies.length === 0) return null
  return {
    frequencies,
    otherLabel: card?.otherLabel?.trim() || 'Other',
    titleMonthly: card?.titleMonthly?.trim() || 'At {amount} a month',
    titleOnce: card?.titleOnce?.trim() || 'At {amount}',
    words: { one: card?.messageOne?.trim() || 'A short personal message', many: card?.messageMany?.trim() || '{count} short personal messages' },
    anyTitle: card?.anyTitle?.trim() || 'Any amount helps',
    anyBenefits: textsOf(card?.anyBenefits, 'text'),
    ctaMonthly: card?.ctaMonthly?.trim() || 'Give {amount} a month',
    ctaOnce: card?.ctaOnce?.trim() || 'Give {amount}',
    ctaOther: card?.ctaOther?.trim() || 'Give another amount',
    levels: levelViews(content.levels),
    tiers: tiersOf(content.messageTiers),
    form: content.donationForm,
  }
}

/** The choices across the top of the Other ways page, in the order the admin set, each with its words. A choice with no name is left out. */
export function groupViews(ways: SupportPage['ways']): WayGroup[] {
  return (ways?.groups ?? []).flatMap((g) => (g.key && g.label?.trim() ? [{ key: g.key, label: g.label.trim(), best: g.best?.trim() ?? '', effort: g.effort?.trim() ?? '' }] : []))
}

export type PanelView = WayPanel & {
  id: string
  eyebrow: string
  title: string
  lead: string
  buttonLabel: string
  buttonHref: string
  showDetails: boolean
  steps: string[]
  notes: string[]
}

/** The panels an editor has completed (a group and a name for the address). The address name is made lowercase so `?way=` matches it however it was typed. */
export function panelViews(ways: SupportPage['ways']): PanelView[] {
  return (ways?.panels ?? []).flatMap((p) => {
    const slug = p.slug?.trim().toLowerCase()
    if (!p.group || !slug) return []
    return [
      {
        id: p.id ?? slug,
        slug,
        group: p.group,
        tabLabel: p.tabLabel?.trim() ?? '',
        eyebrow: p.eyebrow?.trim() ?? '',
        title: p.title?.trim() ?? '',
        lead: p.lead?.trim() ?? '',
        buttonLabel: p.buttonLabel?.trim() ?? '',
        buttonHref: p.buttonHref?.trim() ?? '',
        showDetails: Boolean(p.showDetails),
        steps: textsOf(p.steps, 'text'),
        notes: textsOf(p.notes, 'text'),
      } satisfies PanelView,
    ]
  })
}
