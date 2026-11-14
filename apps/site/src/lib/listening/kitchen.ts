import type { Checked } from './inbox'

/**
 * A kitchen table: someone starts one private table of their own from the website, for a campaign that accepts them. The host's name
 * and where it is are optional and are shown to nobody but WUWF's staff, beside the recording; the rules are the Portal's, so these
 * only stop a request that would be refused.
 */
export interface KitchenInput {
  hostName: string
  place: string
}

export const KITCHEN_NAME_MAX = 60
export const KITCHEN_PLACE_MAX = 80

export function checkKitchen(input: KitchenInput): Checked<{ hostName: string | null; place: string | null }> {
  const hostName = input.hostName.trim()
  const place = input.place.trim()
  if (hostName.length > KITCHEN_NAME_MAX) return { ok: false, message: `A name can be at most ${KITCHEN_NAME_MAX} characters.` }
  if (place.length > KITCHEN_PLACE_MAX) return { ok: false, message: `Where it is can be at most ${KITCHEN_PLACE_MAX} characters.` }
  return { ok: true, value: { hostName: hostName || null, place: place || null } }
}

/** The page a started kitchen table opens: the table's own link, which its phone redeems with a press. */
export function kitchenTablePath(linkToken: string): string {
  return `/listens/table/${encodeURIComponent(linkToken)}`
}
