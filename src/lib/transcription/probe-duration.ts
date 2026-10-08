import { isVideoContentType } from "@/lib/transcription/media";

/**
 * Reads a local audio or video file's duration in the browser, with no server
 * round trip; resolves null when the browser can't read it (an odd container,
 * a corrupt header). Browser-only: it needs `document` and object URLs, which
 * is why it sits beside media.ts rather than in it.
 */
export function probeDurationMs(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement(isVideoContentType(file.type) ? "video" : "audio");
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(objectUrl);

    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const ms = Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : null;
      cleanup();
      resolve(ms);
    };
    el.onerror = () => {
      cleanup();
      resolve(null);
    };
    el.src = objectUrl;
  });
}
