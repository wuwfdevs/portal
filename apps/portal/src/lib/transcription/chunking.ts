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

// Document chunking (docs/sourcework-design.md §8.8) — the same "overlapping
// retrieval window" idea as buildChunks above, walking blocks in reading
// order and closing a window by character count instead of milliseconds:
// documents have no natural time axis. Kept as a separate function rather
// than parameterizing buildChunks, since the two walks close windows on
// genuinely different units and sharing one function would mean threading
// a duration-vs-character-count branch through the whole loop.

/** Target window length, in characters — roughly a few paragraphs. */
export const DOCUMENT_CHUNK_TARGET_CHARS = 1200;

/** How many trailing blocks the next window reaches back into — same reasoning as CHUNK_OVERLAP_MS, in a block-count unit instead of a time one. */
export const DOCUMENT_CHUNK_OVERLAP_BLOCKS = 1;

export interface ChunkSourceBlock {
  id: string;
  pageNumber: number;
  readingOrder: number;
  text: string;
}

export interface DocumentChunk {
  pageStart: number;
  pageEnd: number;
  /** This window's first block — a document search hit's deep-link target when a bbox is available (see design doc §8.8). */
  anchorBlockId: string;
  text: string;
}

/**
 * Slices a document's blocks (already ordered by reading_order) into
 * overlapping windows by character count. Blocks with no text (e.g. an
 * image block with no OCR'd caption) are skipped, same as an empty segment
 * is skipped by buildChunks.
 */
export function buildDocumentChunks(blocks: ChunkSourceBlock[]): DocumentChunk[] {
  const usable = blocks
    .filter((block) => block.text.trim().length > 0)
    .sort((a, b) => a.readingOrder - b.readingOrder);

  const chunks: DocumentChunk[] = [];
  let index = 0;

  while (index < usable.length) {
    let end = index;
    let charCount = 0;
    while (end < usable.length) {
      const block = usable[end]!;
      if (end > index && charCount + block.text.length > DOCUMENT_CHUNK_TARGET_CHARS) break;
      charCount += block.text.length;
      end += 1;
    }

    const windowBlocks = usable.slice(index, end);
    chunks.push({
      pageStart: Math.min(...windowBlocks.map((block) => block.pageNumber)),
      pageEnd: Math.max(...windowBlocks.map((block) => block.pageNumber)),
      anchorBlockId: windowBlocks[0]!.id,
      text: windowBlocks.map((block) => block.text.trim()).join("\n\n"),
    });

    if (end >= usable.length) break;
    // Always progress at least one block forward, same guard buildChunks
    // uses, so a single block far exceeding the target can't stall the walk.
    index = Math.max(index + 1, end - DOCUMENT_CHUNK_OVERLAP_BLOCKS);
  }

  return chunks;
}
