import type { HubLoad } from '@/lib/listening/load'
import { LISTENING_NOT_SET_UP } from '@/lib/listening/messages'

// What the Listens blocks (Ask WUWF, Open questions, Sessions and tables, Outcomes, Host form) share. They read the Portal's hub through the page context
// (`SectionContext.listeningHub`, loaded by the route that renders the page per request) and draw nothing without it.

/** A card on the section's ground, in the tone's own card colours. */
export const cardClass = 'rounded-lg border [background:var(--tone-card)] [border-color:var(--tone-card-rule)]'

/** The outlined button of a card ("Answer", "Save a seat"): the tone's text colour, so it reads on every tone. */
export const outlineButton =
  'inline-flex min-h-11 items-center justify-center self-start rounded-sm border px-4 text-[0.9375rem] font-bold hover:no-underline hover:opacity-80 [border-color:var(--tone-text)] [color:var(--tone-text)]'

/**
 * The forms (Ask WUWF, a kitchen table, host a session) carry their own light styling, made for a light ground. Wherever one is placed it sits in this card,
 * so it is right on a dark tone too.
 */
export const lightFormCard = 'rounded-lg bg-surface p-5 text-ink md:p-6'

export const LISTENING_LOAD_ERROR = "We couldn't load the questions just now. Try again in a moment."

/** The sentence for a hub that could not be read, or null when it was. The words are the site's; the Portal's state is the cause. */
export function hubProblem(load: HubLoad | undefined): string | null {
  if (!load || load.kind === 'ok') return null
  return load.kind === 'not_set_up' ? LISTENING_NOT_SET_UP : LISTENING_LOAD_ERROR
}
