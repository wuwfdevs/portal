// The pure half of sending a conversation to Sourcework: which segments make the recording and in what order, the list ffmpeg's concat
// demuxer reads, and the words on the source it makes. No ffmpeg, no Supabase.

export interface SegmentRow {
  seq: number;
  status: string;
  storage_path: string;
  content_type: string;
}

/**
 * The uploaded segments in order, or the reason the recording cannot be assembled: every segment from 0 to `lastSeq` has to be there
 * and uploaded. A gap would silently drop minutes from the transcript, so it is refused and named.
 */
export function orderSegments(
  segments: readonly SegmentRow[],
  lastSeq: number | null,
): { ok: true; segments: SegmentRow[] } | { ok: false; error: string } {
  if (lastSeq === null || lastSeq < 0) return { ok: false, error: "This table has not finished recording yet." };
  const bySeq = new Map(segments.filter((s) => s.status === "uploaded").map((s) => [s.seq, s]));
  const missing: number[] = [];
  const ordered: SegmentRow[] = [];
  for (let seq = 0; seq <= lastSeq; seq += 1) {
    const segment = bySeq.get(seq);
    if (segment) ordered.push(segment);
    else missing.push(seq);
  }
  if (missing.length > 0) {
    return { ok: false, error: `Segment${missing.length === 1 ? "" : "s"} ${missing.join(", ")} ${missing.length === 1 ? "has" : "have"} not uploaded, so the recording is not whole yet.` };
  }
  return { ok: true, segments: ordered };
}

/** The concat demuxer's list: one `file` line per path, with single quotes escaped the way ffmpeg reads them. */
export function concatListFile(paths: readonly string[]): string {
  return paths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n") + "\n";
}

/** The file extension a segment is written with locally, so ffmpeg can tell the container. */
export function segmentExtension(contentType: string): string {
  switch (contentType) {
    case "audio/webm":
      return "webm";
    case "audio/ogg":
      return "ogg";
    case "audio/mp4":
      return "m4a";
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
      return "wav";
    default:
      return "bin";
  }
}

/** One recording from many pieces, as a speech-sized MP3: mono, 64 kbit/s keeps a two-hour table well under the bucket's limit. */
export const CONCAT_FFMPEG_ARGS = (listPath: string, outputPath: string): string[] => [
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  listPath,
  "-vn",
  "-ac",
  "1",
  "-ar",
  "44100",
  "-c:a",
  "libmp3lame",
  "-b:a",
  "64k",
  "-y",
  outputPath,
];

export function sourceTitle(event: { title: string }, tableNumber: number): string {
  return `${event.title}, table ${tableNumber}`;
}

/** What the source says about where it came from. No name, contact or anything a person said: only the season, place and time. */
export function sourceDescription(input: {
  campaignTitle: string;
  question: string;
  eventTitle: string;
  placeName: string;
  tableNumber: number;
  startsAt: string;
}): string {
  return [
    `A recorded listening-session table: ${input.eventTitle}, table ${input.tableNumber}, at ${input.placeName}.`,
    `Season: ${input.campaignTitle}. The question asked: ${input.question}`,
    `Recorded on ${input.startsAt.slice(0, 10)}. Participants agreed to be recorded as a group before it began.`,
  ].join("\n");
}
