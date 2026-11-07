// Class names for a themed show's components. Every colour and face is a `--color-show-*` / `--font-show-*` variable
// declared by the show's theme (lib/shows/themes.ts), so these serve every themed show.
export const t = {
  page: 'bg-(--color-show-bg) text-(--color-show-text) font-(family-name:--font-show-body)',
  container: 'mx-auto w-full max-w-[75rem] px-4 md:px-12',
  label: 'font-(family-name:--font-show-label) uppercase tracking-[0.18em]',
  eyebrow: 'font-(family-name:--font-show-label) text-base uppercase tracking-[0.2em] text-(--color-show-accent)',
  display: 'font-(family-name:--font-show-display) font-normal leading-[1.02] tracking-[-0.015em]',
  muted: 'text-(--color-show-muted)',
  rule: 'border-(--color-show-rule)',
  card: 'relative flex flex-col gap-2 border border-(--color-show-border) bg-(--color-show-surface) p-5 transition-colors duration-200 hover:bg-(--color-show-raised)',
  // Separate bordered cards: a seam-line grid (gap over a coloured ground) paints its empty cells when a row is not full.
  grid: 'grid gap-3',
  link: 'text-(--color-show-accent) underline-offset-4 hover:text-(--color-show-accent-hover) hover:underline',
  primary:
    'inline-flex min-h-12 items-center justify-center bg-(--color-show-accent) px-6 font-(family-name:--font-show-label) text-lg uppercase tracking-[0.18em] text-(--color-show-on-accent) hover:bg-(--color-show-accent-hover) hover:text-(--color-show-on-accent) hover:no-underline',
  secondary:
    'inline-flex min-h-12 items-center justify-center border border-(--color-show-rule) px-6 font-(family-name:--font-show-label) text-lg uppercase tracking-[0.18em] text-(--color-show-text) hover:border-(--color-show-accent) hover:text-(--color-show-accent) hover:no-underline',
  badgeFree: 'font-(family-name:--font-show-label) text-sm uppercase tracking-[0.18em] text-(--color-show-free)',
  badgeMembers: 'font-(family-name:--font-show-label) text-sm uppercase tracking-[0.18em] text-(--color-show-accent)',
} as const

/** The members' panel (board 23) in the show's look. */
export const membersPanelClasses = {
  box: 'flex flex-col gap-4 border border-(--color-show-rule) bg-(--color-show-surface) p-6 md:p-8',
  eyebrow: 'font-(family-name:--font-show-label) text-base uppercase tracking-[0.2em] text-(--color-show-accent)',
  heading: 'font-(family-name:--font-show-display) text-3xl leading-tight text-(--color-show-text)',
  text: 'max-w-[40rem] text-base italic leading-relaxed text-(--color-show-muted)',
  primary: t.primary,
  secondary: t.secondary,
}
