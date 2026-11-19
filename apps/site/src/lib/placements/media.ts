// What a placement's picture may be. A placement is a still picture and a link: no motion, no sound, nothing that plays. The media library takes any
// file (video and animated pictures included, and the site draws a video with autoplay), so a placement checks what it was given, in the admin when it is
// saved and again when it is drawn, so a picture that predates the rule, or came in by a script, cannot play on a page.

/** The picture types a placement takes. Not GIF (it animates), not SVG (the image optimiser refuses it), not video. */
export const STILL_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'] as const

export const STILL_IMAGE_MESSAGE = 'Choose a still picture (PNG, JPEG, WebP or AVIF). Video and animated pictures are not allowed in a placement.'

/**
 * The shape a picture's box should take so the box is exactly as tall as the picture: the picture's own width and height. Artwork that is not the zone's
 * recommended size would otherwise be fitted inside a box of the zone's shape and leave blank bands above and below it, so the space between tiles would
 * differ from one tile to the next. A record with no usable size (not recorded, zero, not a number) takes the fallback, the zone's recommended shape.
 */
export function pictureShape(
  media: { width?: number | null; height?: number | null } | null | undefined,
  fallback: { width: number; height: number },
): { width: number; height: number } {
  const w = media?.width
  const h = media?.height
  return typeof w === 'number' && typeof h === 'number' && Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? { width: w, height: h } : fallback
}

/** Whether a media record may be drawn in a placement. A record with no type recorded is left to the admin's check; one with a type must be a still picture. */
export function isStillPicture(media: { mimeType?: string | null } | null | undefined): boolean {
  if (!media || typeof media !== 'object') return false
  if (media.mimeType == null) return true
  return (STILL_IMAGE_TYPES as readonly string[]).includes(media.mimeType.toLowerCase())
}
