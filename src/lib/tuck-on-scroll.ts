/** How far a scroll has to move before the direction counts, so a fingertip's jitter changes nothing. */
export const TUCK_DELTA_PX = 8;
/** Near the top of the page the control is always shown. */
export const TUCK_MIN_Y = 120;

export interface TuckState {
  tucked: boolean;
  /**
   * Where the current movement started: the lowest point reached while the control is shown, the highest
   * while it is tucked. The direction only changes once the scroll has moved a full delta from it, so a
   * slow scroll made of tiny steps still counts and a small reversal does not flip the control back.
   */
  anchor: number;
}

export const INITIAL_TUCK: TuckState = { tucked: false, anchor: 0 };

/**
 * The state of a floating control (the assistant's bubble) after the page scrolls to `y`: scrolling
 * down tucks it away, scrolling up (or being near the top) brings it back. Pure, so the hook that
 * listens to the window is the only part with a browser.
 */
export function nextTuck(state: TuckState, y: number): TuckState {
  if (y < TUCK_MIN_Y) return { tucked: false, anchor: y };
  if (!state.tucked) {
    if (y > state.anchor + TUCK_DELTA_PX) return { tucked: true, anchor: y };
    return { tucked: false, anchor: Math.min(state.anchor, y) };
  }
  if (y < state.anchor - TUCK_DELTA_PX) return { tucked: false, anchor: y };
  return { tucked: true, anchor: Math.max(state.anchor, y) };
}
