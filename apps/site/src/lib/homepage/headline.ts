// The page lead's headline size. Pure.

/** A headline longer than this is set a step smaller on a wide screen, so it does not run to six lines beside the picture. */
export const LONG_HEADLINE = 60

/** The page lead's headline size classes: the full size for a short headline, one step down from `xl` for a long one. Whole class names, so Tailwind generates them. */
export function leadHeadlineClass(title: string): string {
  return title.trim().length > LONG_HEADLINE ? 'text-3xl md:text-4xl' : 'text-3xl md:text-4xl xl:text-5xl'
}
