// Pure retrieval-unit logic: how a transcript is sliced for search, and what
// text actually gets embedded. No "server-only" and no Supabase — testable
// without mocks, per the repo's testing conventions.
//
// See docs/transcription-workspace-design.md §5/§6. Segments are too granular
// to embed well (a few seconds of speech is a noisy embedding), so the
// retrieval unit is an overlapping window of transcript with speaker names
// inlined.

import { speakerDisplayLabel } from "./transcript";

/** Target window length. Long enough to carry a topic, short enough to stay one. */
export const CHUNK_TARGET_MS = 45_000;

/**
 * How far the next window reaches back into the previous one. Without an
 * overlap, a quote that straddles a window boundary is split across two
 * mediocre embeddings and retrieved well by neither.
 */
export const CHUNK_OVERLAP_MS = 10_000;

/** Cap on how much project background rides along on every chunk's embedding. */
const HEADER_DESCRIPTION_LIMIT = 400;

export interface ChunkSourceSegment {
  startMs: number;
  endMs: number;
  text: string;
  speakerId: string | null;
}

export interface ChunkSourceSpeaker {
  id: string;
  diarizationLabel: string;
  displayName: string | null;
}

export interface TranscriptChunk {
  startMs: number;
  endMs: number;
  text: string;
}

/**
 * Slices a project's segments into overlapping windows, each labelled with
 * who is speaking. Segments are assumed sorted by position (which is start
 * order); empty segments are skipped, since a window of silence is not a
 * retrieval unit.
 *
 * A window closes once adding the next segment would carry it past
 * CHUNK_TARGET_MS, and the following window restarts CHUNK_OVERLAP_MS back —
 * but always at least one segment forward, so a single segment longer than
 * the target can't stall the walk.
 */
export function buildChunks(
  segments: ChunkSourceSegment[],
  speakers: ChunkSourceSpeaker[],
): TranscriptChunk[] {
  const usable = segments.filter((segment) => segment.text.trim().length > 0);
  const labelById = new Map(
    speakers.map((speaker) => [
      speaker.id,
      speakerDisplayLabel(speaker.diarizationLabel, speaker.displayName),
    ]),
  );

  const chunks: TranscriptChunk[] = [];
  let index = 0;

  while (index < usable.length) {
    const startMs = usable[index]!.startMs;
    const lines: string[] = [];
    let lastSpeakerId: string | null | undefined;
    let end = index;

    while (end < usable.length) {
      const segment = usable[end]!;
      if (end > index && segment.endMs - startMs > CHUNK_TARGET_MS) break;

      const text = segment.text.trim();
      if (segment.speakerId !== lastSpeakerId) {
        const label = segment.speakerId ? labelById.get(segment.speakerId) : undefined;
        lines.push(`${label ?? "Unknown speaker"}: ${text}`);
        lastSpeakerId = segment.speakerId;
      } else {
        lines.push(text);
      }
      end += 1;
    }

    const endMs = usable[end - 1]!.endMs;
    chunks.push({
      startMs,
      // The tw_chunks check constraint requires end_ms > start_ms, and a
      // single zero-length segment would otherwise violate it.
      endMs: Math.max(endMs, startMs + 1),
      text: lines.join("\n"),
    });

    if (end >= usable.length) break;

    let next = end;
    for (let candidate = index + 1; candidate < end; candidate += 1) {
      if (usable[candidate]!.startMs >= endMs - CHUNK_OVERLAP_MS) {
        next = candidate;
        break;
      }
    }
    index = next;
  }

  return chunks;
}

export interface ChunkProjectContext {
  title: string;
  interviewDate: string | null;
  description: string | null;
}

/**
 * The string that actually gets embedded: the window's text with a line of
 * the project's own context in front of it.
 *
 * This is why filling in a project's background is worth a reporter's time
 * (design doc §3G). A passage reading "we can't keep patching it" says
 * nothing about a county commission or a bridge; prefixed with the project's
 * title, date, and background, it becomes retrievable by a query about
 * either. The stored chunk text stays raw so result snippets don't show the
 * header back to the reader.
 */
export function buildEmbeddingInput(project: ChunkProjectContext, text: string): string {
  const heading = [project.title.trim(), project.interviewDate?.slice(0, 10)]
    .filter(Boolean)
    .join(" — ");

  const background = project.description?.trim();
  const header = [heading, background && truncate(background, HEADER_DESCRIPTION_LIMIT)]
    .filter(Boolean)
    .join("\n");

  return header ? `${header}\n\n${text}` : text;
}

/** The embedding input for a clip — its editorial title and the words in it, in the same project context. */
export function buildClipEmbeddingInput(
  project: ChunkProjectContext,
  clip: { title: string; excerpt: string },
): string {
  return buildEmbeddingInput(project, `${clip.title.trim()}\n${clip.excerpt.trim()}`);
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit).trimEnd()}…`;
}
