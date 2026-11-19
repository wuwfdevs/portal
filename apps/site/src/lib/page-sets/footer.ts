// The line under the last section of a page in a set with a footer (the sponsor set; the giving set follows in phase 4). Pure: the settings go in, what
// to print comes out. The words "Corporate support" are the one fixed phrase; the line, phone, address and the guidelines link are the settings'.

import { phoneHref } from '@/lib/page-content'
import { SPONSOR_PATHS } from '@/lib/sponsorship/paths'

export interface SponsorFooterSettings {
  serviceLine?: string | null
  phone?: string | null
  address?: string | null
}
export interface FooterLink {
  label: string
  href: string
}
export interface FooterView {
  serviceLine: string
  phone: { text: string; href: string | null } | null
  address: string
  link: FooterLink | null
}

/** What the sponsorship footer prints; null when there is nothing to say. The guidelines link is the set's own page under the name its navigation gives it. */
export function sponsorFooter(settings: SponsorFooterSettings | null | undefined, navItems: ReadonlyArray<{ label: string; href: string }>): FooterView | null {
  const serviceLine = settings?.serviceLine?.trim() ?? ''
  const phoneText = settings?.phone?.trim() ?? ''
  const address = settings?.address?.trim() ?? ''
  const guidelines = navItems.find((i) => i.href === SPONSOR_PATHS.guidelines)
  if (!serviceLine && !phoneText && !address) return null
  return {
    serviceLine,
    phone: phoneText ? { text: phoneText, href: phoneHref(phoneText) } : null,
    address,
    link: guidelines ? { label: guidelines.label, href: guidelines.href } : null,
  }
}
