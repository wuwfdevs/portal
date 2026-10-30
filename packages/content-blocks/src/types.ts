// The block schema a Portal piece is sent to the site in. It is deliberately self-contained: the
// site never reads the Portal's tables, so an audio excerpt carries its own transcript, speaker,
// source and timing. Blocks are plain data, written by code, so the parser refuses a surprise
// rather than repairing it (the same rule as the Portal's parsePieceBody).

export const CONTENT_SCHEMA_VERSION = 1 as const;

/** A reference to a media file the Portal holds. The site fetches it through the signed contract, never by table. */
export interface MediaReference {
  id: string;
  mimeType: string;
  durationMs?: number;
  /** Lowercase hex SHA-256 of the file, so the site can verify what it fetched. */
  sha256?: string;
}

export interface Speaker {
  name: string;
  /** For example "Resident, Warrington". */
  description?: string;
}

export interface SourceCitation {
  title: string;
  /** ISO date (YYYY-MM-DD) the recording was made, when known. */
  recordedOn?: string;
}

export type TextStyle = "paragraph" | "heading" | "subheading" | "quote";

export interface TextBlock {
  id: string;
  type: "text";
  style: TextStyle;
  text: string;
  /** Who said it, for a pull quote. */
  attribution?: string;
}

/** Words read by the reporter or host. `anchor` is the anchor's lead-in, read by someone else. */
export interface NarrationBlock {
  id: string;
  type: "narration";
  text: string;
  role?: "anchor";
}

export interface AudioExcerptBlock {
  id: string;
  type: "audio_excerpt";
  /** Id of an entry in the document's `media`. */
  mediaId: string;
  /** The words spoken in the range, taken from the transcript. */
  transcript: string;
  speaker: Speaker;
  source: SourceCitation;
  startMs: number;
  endMs: number;
  caption?: string;
}

/** Internal. Never published: `publicBlocks` removes it before anything is rendered. */
export interface EditorNoteBlock {
  id: string;
  type: "editor_note";
  text: string;
}

export type ContentBlock = TextBlock | NarrationBlock | AudioExcerptBlock | EditorNoteBlock;

/** Where a document came from, so a later send of the same piece is a new version, not a new draft. */
export interface Provenance {
  system: "portal";
  projectId: string;
  pieceId: string;
  /** The piece version being sent. */
  version: number;
  excerptIds: string[];
  findingIds: string[];
  /** Portal user id of the person who sent it. */
  sentBy: string;
  /** ISO 8601 timestamp. */
  sentAt: string;
}

/** Where on the site the draft belongs, by slug. All optional: an editor can set them in the CMS. */
export interface Placement {
  publishingIdentity?: string;
  fellowship?: string;
  series?: string;
}

export interface ContentDocument {
  schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  title: string;
  dek?: string;
  blocks: ContentBlock[];
  media: MediaReference[];
  provenance: Provenance;
  placement?: Placement;
}
