import { cn } from '@/utilities/ui'

/**
 * The one definition of a button's look (direction C2): a pill, 44px or 48px tall, bold. `buttonClasses` is pure, so the class constants
 * that already exist (`components/PageParts`, `components/Listening/styles`, `blocks/sections/parts`) delegate here instead of
 * defining a button of their own, and a button that cannot be the `Button` component (a `<button>` inside a form, a link in a row)
 * still looks the same.
 *
 * Variants: `primary` ink; `action` link blue (white on blue-700 is 7:1; the lighter blue fails 4.5:1 with text on it, so it is not used); `play` lime with dark text (audio, on white or on dark); `outline` a 2px ink ring; `onDark` lime on a dark
 * panel; `outlineOnDark` a light ring on a dark panel; `tone` and `toneOutline` read the band's own button colours (`--tone-*`, set by
 * the page theme), so a block is right on every tone; `link` is a text button. Colours are tokens; nothing here is a hex.
 */

export type ButtonVariant = 'primary' | 'action' | 'play' | 'outline' | 'onDark' | 'outlineOnDark' | 'tone' | 'toneOutline' | 'link'
export type ButtonSize = 'md' | 'lg'

export const BUTTON_VARIANTS: readonly ButtonVariant[] = ['primary', 'action', 'action', 'play', 'outline', 'onDark', 'outlineOnDark', 'tone', 'toneOutline', 'link']

const shape = 'inline-flex items-center justify-center gap-2 font-bold no-underline hover:no-underline disabled:cursor-not-allowed'
const pill = `${shape} rounded-pill`
const size: Record<ButtonSize, string> = {
  md: 'min-h-11 px-[1.125rem] text-[0.9375rem]',
  lg: 'min-h-12 px-6 text-base',
}
const ring = 'shadow-[inset_0_0_0_1.5px_currentColor]'

const variant: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-surface hover:bg-ink-2 disabled:bg-surface-3 disabled:text-ink-3',
  action: 'bg-wuwf-blue-700 text-surface hover:bg-wuwf-blue-600 disabled:bg-surface-3 disabled:text-ink-3',
  play: 'bg-wuwf-lime text-surface-dark hover:bg-wuwf-lime-600 disabled:bg-surface-3 disabled:text-ink-3',
  outline: 'border-2 border-ink bg-transparent text-ink hover:bg-surface-2 disabled:border-rule-strong disabled:text-ink-3',
  onDark: 'bg-wuwf-lime text-surface-dark hover:bg-wuwf-lime-600',
  outlineOnDark: `bg-transparent text-surface ${ring} hover:bg-surface-dark-hover`,
  tone: '[background-color:var(--tone-button)] [color:var(--tone-button-text)] hover:opacity-90',
  toneOutline: `bg-transparent [color:var(--tone-ghost)] ${ring} hover:opacity-80`,
  link: '',
}

/** The classes of a button. `className` is merged last, so a caller can add layout (`self-start`, `mt-2`) or override a size. */
export function buttonClasses(options: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  const v = options.variant ?? 'primary'
  if (v === 'link') {
    return cn('inline-flex min-h-11 items-center bg-transparent px-1 text-[0.9375rem] font-semibold text-wuwf-blue-700 hover:underline disabled:text-ink-3', options.className)
  }
  return cn(pill, size[options.size ?? 'md'], variant[v], options.className)
}
