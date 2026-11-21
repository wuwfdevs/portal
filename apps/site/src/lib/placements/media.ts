// What a placement's picture may be. A placement is a still picture and a link: no motion, no sound, nothing that plays. The media library takes any
// file (video and animated pictures included, and the site draws a video with autoplay), so a placement checks what it was given, in the admin when it is
// saved and again when it is drawn, so a picture that predates the rule, or came in by a script, cannot play on a page.

/** The picture types a placement takes. Not GIF (it animates), not SVG (the image optimiser refuses it), not video. */
export const STILL_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'] as const

export const STILL_IMAGE_MESSAGE = 'Choose a still picture (PNG, JPEG, WebP or AVIF). Video and animated pictures are not allowed in a placement.'

/**
 * Whether a picture already fills a frame of the given shape, so no backdrop is needed behind it. True only for a picture whose size is recorded and whose
 * shape is within a few percent of the frame's; a picture with no usable size (not recorded, zero, not a number) is treated as not filling it, because the
 * safe mistake is to draw a backdrop behind a picture that did not need one, not to leave a white box around one that did.
 */
export function fillsFrame(media: { width?: number | null; height?: number | null } | null | undefined, frame: { width: number; height: number }, tolerance = 0.03): boolean {
  const w = media?.width
  const h = media?.height
  if (typeof w !== 'number' || typeof h !== 'number' || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false
  return Math.abs(w / h / (frame.width / frame.height) - 1) <= tolerance
}

/** Whether a media record may be drawn in a placement. A record with no type recorded is left to the admin's check; one with a type must be a still picture. */
export function isStillPicture(media: { mimeType?: string | null } | null | undefined): boolean {
  if (!media || typeof media !== 'object') return false
  if (media.mimeType == null) return true
  return (STILL_IMAGE_TYPES as readonly string[]).includes(media.mimeType.toLowerCase())
}
