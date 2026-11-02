// What an editor may upload as a screenshot, and where it's stored. The
// bucket enforces type and size too (20260928160000_resources_media.sql);
// checking here first gives a message before anything is uploaded. Pure —
// colocated test.

/** The private bucket every screenshot lives in (20260928160000_resources_media.sql). */
export const RESOURCES_MEDIA_BUCKET = "resources-media";

export const SCREENSHOT_TYPES = ["image/png", "image/webp"] as const;
export const SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;
export const SCREENSHOT_MAX_WIDTH = 2400;

const EXTENSIONS: Record<(typeof SCREENSHOT_TYPES)[number], string> = {
  "image/png": "png",
  "image/webp": "webp",
};

function isScreenshotType(type: string): type is (typeof SCREENSHOT_TYPES)[number] {
  return (SCREENSHOT_TYPES as readonly string[]).includes(type);
}

/** A message refusing the file, or null when it can be uploaded. */
export function validateScreenshot(
  file: { type: string; size: number },
  size: { width: number; height: number },
): string | null {
  if (!isScreenshotType(file.type)) return "Screenshots must be PNG or WebP.";
  if (file.size > SCREENSHOT_MAX_BYTES) return "That screenshot is over 2 MB. Crop or compress it.";
  if (size.width > SCREENSHOT_MAX_WIDTH) {
    return `That screenshot is ${size.width}px wide. The limit is ${SCREENSHOT_MAX_WIDTH}px.`;
  }
  if (size.width < 1 || size.height < 1) return "That image has no size.";
  return null;
}

/** An editor upload's object path: `<article_id>/<media_id>.<ext>`. */
export function screenshotObjectPath(articleId: string, mediaId: string, type: string): string {
  const extension = isScreenshotType(type) ? EXTENSIONS[type] : "png";
  return `${articleId}/${mediaId}.${extension}`;
}
