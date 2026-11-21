import { buttonClasses } from '@/components/Kit/button'
import { eyebrowLabel } from '@/components/Kit/Eyebrow'

// Class names the listening screens share. Colours and radii come from the design tokens (tokens.css); the boards' blue
// button uses --wuwf-blue with white text (3.4:1), which misses the 4.5:1 the site requires, so text buttons here use
// --wuwf-blue-700 (7:1) and the lighter blue stays for fills with no text on them.

export const eyebrow = `${eyebrowLabel} text-wuwf-blue-700`

export const buttonPrimary = buttonClasses({ variant: 'action' })
export const buttonDark = buttonClasses({ variant: 'primary' })
export const buttonSecondary = buttonClasses({ variant: 'outline' })
export const buttonLink = buttonClasses({ variant: 'link' })

export const field = 'min-h-11 w-full rounded-sm border border-rule-strong bg-surface px-3 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-wuwf-blue-700'
export const textarea = 'w-full resize-y rounded-sm border border-rule-strong bg-surface p-3 text-base leading-normal text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-wuwf-blue-700'
export const label = 'text-sm font-semibold text-ink'
export const hint = 'text-xs text-ink-3'

export const noticeInfo = 'rounded-sm border border-wuwf-blue-100 bg-wuwf-blue-100/40 px-3.5 py-3 text-sm leading-relaxed text-ink-2'
export const noticeWarn = 'rounded-sm border border-warning-border bg-warning-bg px-3.5 py-3 text-sm text-warning-fg'
export const noticeOk = 'rounded-sm border border-wuwf-lime bg-wuwf-lime-100 px-3.5 py-3 text-sm font-semibold text-success-fg'

export const checkbox = 'mt-0.5 size-5 shrink-0 accent-wuwf-blue-700'
export const checkRow = 'flex items-start gap-2.5 text-sm leading-normal text-ink'
