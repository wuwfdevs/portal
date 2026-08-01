// Pure source/project status logic — no "server-only", no Supabase. Split
// out of projects.ts so client components (source cards, project rows) can
// import processingLabel()/ProjectStatus without pulling in the rest of
// that module's server-only data access, which broke the client build the
// first time this was tried (bundling `import "server-only"` transitively
// via a supposedly-just-a-value import). See docs/sourcework-design.md §8.9.

import type { SwSourceKind } from "@/lib/database.types";

/** The same four states tw_projects.status used to carry, now derived from a source + its primary representation (a transcript, or a document_text — see docs/sourcework-design.md §8.9). */
export type ProjectStatus = "uploading" | "processing" | "ready" | "failed";

interface StatusSource {
  status: "uploading" | "ready" | "failed";
}

interface StatusRepresentation {
  status: "pending" | "processing" | "ready" | "failed";
}

/**
 * Collapses a source's upload status and its primary representation's
 * status into the one status the workspace UI has always shown. Kind-
 * agnostic: an audio/video source's primary representation is its
 * transcript, a document source's is its document_text extraction — the
 * logic itself never needed to know which, only its (misleading, until
 * §8.9) parameter name implied otherwise. A project can (eventually)
 * reference more than one source, but every screen that shows a single
 * status is still looking at one source's worth of work — see
 * docs/sourcework-design.md.
 */
export function computeProjectStatus(
  source: StatusSource | null,
  representation: StatusRepresentation | null,
): ProjectStatus {
  if (!source || source.status === "uploading") return "uploading";
  if (source.status === "failed") return "failed";
  if (!representation || representation.status === "pending") return "processing";
  if (representation.status === "processing") return "processing";
  return representation.status; // 'ready' | 'failed'
}

/**
 * The audio-specific "Transcribing" label was hardcoded across every screen
 * that shows a processing source — see docs/sourcework-design.md §8.9. This
 * is the one place source-kind-aware copy for the `processing` status is
 * decided; screens key their existing status-badge maps off it instead of
 * repeating the literal string.
 */
export function processingLabel(kind: SwSourceKind): string {
  return kind === "document" ? "Extracting text" : "Transcribing";
}
