import type { AudioExcerptBlock, ContentBlock, ContentDocument } from "./types";

/** Reading speed for the "N min read" estimate. */
export const READ_WORDS_PER_MINUTE = 200;

/** Blocks that may reach a reader. Editor notes are internal and are removed here, before any rendering. */
export function publicBlocks(blocks: readonly ContentBlock[]): Exclude<ContentBlock, { type: "editor_note" }>[] {
  return blocks.filter((b): b is Exclude<ContentBlock, { type: "editor_note" }> => b.type !== "editor_note");
}

/** The document as the site may publish it: no editor notes, anywhere. */
export function toPublicDocument(doc: ContentDocument): ContentDocument {
  return { ...doc, blocks: publicBlocks(doc.blocks) };
}

export function excerptDurationMs(block: AudioExcerptBlock): number {
  return block.endMs - block.startMs;
}

/** All reader-visible words, in order, for search and reading-time. Editor notes never count. */
export function plainText(blocks: readonly ContentBlock[]): string {
  return publicBlocks(blocks)
    .map((b) => (b.type === "audio_excerpt" ? b.transcript : b.text))
    .join("\n\n");
}

export function wordCount(text: string): number {
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;
}

/** Whole minutes of reading, at least 1 for any text. Audio excerpts are read as their transcript. */
export function readingMinutes(blocks: readonly ContentBlock[]): number {
  const words = wordCount(plainText(blocks));
  return words === 0 ? 0 : Math.max(1, Math.round(words / READ_WORDS_PER_MINUTE));
}

/** Total audio, in ms, across published excerpts. */
export function totalAudioMs(blocks: readonly ContentBlock[]): number {
  return publicBlocks(blocks).reduce((sum, b) => (b.type === "audio_excerpt" ? sum + excerptDurationMs(b) : sum), 0);
}
