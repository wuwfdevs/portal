/**
 * The focal point an editor sets on a picture in the media library (Payload's "focal point": the point that must stay in view when a picture
 * is cropped), as a CSS `object-position`. Pure.
 *
 * Payload stores it as `focalX` and `focalY`, percentages from 0 (left, top) to 100 (right, bottom), and leaves them empty until an editor sets
 * one. Anything that is not a pair of finite numbers gives nothing, so a picture with no focal point is cropped around its middle, as before.
 * A value outside 0 to 100 is brought back into range. 0 is a real position (the left or top edge), not "empty".
 */
export function objectPositionOf(media: unknown): string | undefined {
  if (!media || typeof media !== 'object') return undefined
  const { focalX, focalY } = media as { focalX?: unknown; focalY?: unknown }
  if (typeof focalX !== 'number' || typeof focalY !== 'number' || !Number.isFinite(focalX) || !Number.isFinite(focalY)) return undefined
  const clamp = (n: number) => Math.min(100, Math.max(0, n))
  return `${clamp(focalX)}% ${clamp(focalY)}%`
}
