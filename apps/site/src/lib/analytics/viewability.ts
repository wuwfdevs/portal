// When a placement counts as viewable. Pure: the component feeds it what the browser observes and asks when it is due.
//
// The rule (`ANALYTICS.md`, "Definitions"): at least half of the unit's pixels in view, in a tab the visitor is looking at, for one continuous
// second. It is modelled on the common display standard and is not audited; reports say so. Leaving view, or the tab going to the background,
// restarts the second. A unit is viewable at most once per page view.

export const VIEWABLE_RATIO = 0.5
export const VIEWABLE_MS = 1000

export interface ViewState {
  /** When the current continuous stretch in view began, or null when the unit is not in view. */
  since: number | null
  /** Already counted on this page view. */
  done: boolean
}

export const NOT_VIEWED: ViewState = { since: null, done: false }

/** Whether what the browser reports puts the unit in view. */
export const inView = (ratio: number, pageVisible: boolean): boolean => pageVisible && ratio >= VIEWABLE_RATIO

/** The state after an observation at `at` (milliseconds). Entering view starts the clock; leaving view stops it. */
export function observe(state: ViewState, visible: boolean, at: number): ViewState {
  if (state.done) return state
  if (!visible) return state.since === null ? state : { since: null, done: false }
  return state.since === null ? { since: at, done: false } : state
}

/** Whether the unit has been in view long enough at `at`. */
export const isDue = (state: ViewState, at: number): boolean => !state.done && state.since !== null && at - state.since >= VIEWABLE_MS
