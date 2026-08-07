// Pure, dependency-free helpers for Underwriting copy audio: upload paths
// and allowed-type checking. No "server-only" here — shared between the
// client-side upload form and server code, mirroring
// lib/log/content-library.ts's own comment (which itself mirrors
// lib/transcription/media.ts).

export const UNDERWRITING_MEDIA_BUCKET = "underwriting-media";

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/x-m4a": "m4a",
};

export function isAllowedAudioType(contentType: string): boolean {
  return contentType in EXTENSION_BY_CONTENT_TYPE;
}

function extensionForContentType(contentType: string): string {
  return EXTENSION_BY_CONTENT_TYPE[contentType] ?? "bin";
}

export function copyAudioObjectPath(copyId: string, contentType: string): string {
  return `${copyId}/audio.${extensionForContentType(contentType)}`;
}
