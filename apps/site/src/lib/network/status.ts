/**
 * What a network story's status may change to, and who may change it. Pure.
 *
 *   new -> held, dismissed          (an editor keeps it for later, or decides it is not wanted)
 *   held -> new, dismissed
 *   gone -> dismissed               (an editor acknowledges a story that was pulled at its source)
 *   anything -> published / gone    (only the publish action and the poll: a story is published by making its post)
 *
 * `dismissed` is final for editors: its content is cleared, only the CDS id stays so the story does not return.
 */

export const NETWORK_STATUSES = ['new', 'held', 'dismissed', 'published', 'gone'] as const
export type NetworkStatus = (typeof NETWORK_STATUSES)[number]

const EDITOR_MOVES: Record<NetworkStatus, readonly NetworkStatus[]> = {
  new: ['held', 'dismissed'],
  held: ['new', 'dismissed'],
  gone: ['dismissed'],
  dismissed: [],
  published: [],
}

export function statusChangeAllowed(from: NetworkStatus, to: NetworkStatus, bySystem: boolean): boolean {
  if (from === to) return true
  if (bySystem) return true
  return EDITOR_MOVES[from].includes(to)
}
