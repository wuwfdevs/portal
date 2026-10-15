/** How far a scroll has to move before the direction counts, so a fingertip's jitter changes nothing. */
export const TUCK_DELTA_PX = 8;
/** Near the top of the page the control is always shown. */
export const TUCK_MIN_Y = 120;

/**
 * Whether a floating control should be tucked away after a scroll from `lastY` to `y`: scrolling down
 * tucks it, scrolling up (or being near the top) brings it back, and a move smaller than the delta
 * leaves it as it was. Pure, so the hook that listens to the window is the only part with a browser.
 */
export function nextTucked(tucked: boolean, lastY: number, y: number): boolean {
  if (y < TUCK_MIN_Y) return false;
  if (y > lastY + TUCK_DELTA_PX) return true;
  if (y < lastY - TUCK_DELTA_PX) return false;
  return tucked;
}
