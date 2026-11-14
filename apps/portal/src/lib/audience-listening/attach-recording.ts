import { MAX_ANSWER_BYTES, isAllowedAnswerType, normalizeContentType } from "./media";

// Staff attach a recording made on a separate recorder to a table whose own phone could not record (or was the wrong tool for the room).
// Pure: the checks the page runs before it asks the database for an upload address.

const TYPE_BY_EXTENSION: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  wav: "audio/wav",
  webm: "audio/webm",
  ogg: "audio/ogg",
  oga: "audio/ogg",
};

/** The content type of a chosen file: the browser's, or the extension's when the browser gave none. Null if it is not one the bucket takes. */
export function recordingContentType(file: { name: string; type: string }): string | null {
  const given = normalizeContentType(file.type || "");
  if (given && isAllowedAnswerType(given)) return given;
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  const byExtension = TYPE_BY_EXTENSION[extension];
  return byExtension ?? null;
}

export type RecordingCheck = { ok: true; contentType: string } | { ok: false; message: string };

export function checkRecordingFile(file: { name: string; type: string; size: number }): RecordingCheck {
  const contentType = recordingContentType(file);
  if (!contentType) return { ok: false, message: "Choose an MP3, M4A, WAV, WebM or Ogg audio file." };
  if (file.size <= 0) return { ok: false, message: "That file is empty." };
  if (file.size > MAX_ANSWER_BYTES) {
    return { ok: false, message: "That file is larger than 50 MB. Export it as a mono MP3 at 64 kbps, which keeps three hours under the limit, and choose that." };
  }
  return { ok: true, contentType };
}
