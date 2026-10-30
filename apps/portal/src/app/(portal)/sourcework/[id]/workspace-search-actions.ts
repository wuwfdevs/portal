"use server";

import { assertToolAccess } from "@/lib/auth/authz";
import { searchArchive, type SearchResult } from "@/lib/transcription/search";
import { listLibraryClips, type LibraryClip } from "@/lib/transcription/clips";

// The project workspace's own scoped search surfaces (docs/sourcework-design.md's
// search scoping) — client-driven, debounced reads, same "call a Server Action
// directly from a client component" pattern source-actions.ts's
// listAttachableSources already uses, rather than a page navigation + new
// searchParams render. Read-only, but every other action in this directory
// gates on assertToolAccess first, so these do too even though RLS alone
// already scopes what tw_search can return.

/** The project workspace's search box — scoped to this project's own sources (part of a project can span more than one, Phase 3a). */
export async function searchProjectAction(
  projectId: string,
  query: string,
): Promise<SearchResult[]> {
  await assertToolAccess("transcription");
  return searchArchive(query, { projectId });
}

/**
 * The excerpt pane's search box — scoped to one source's own text +
 * excerpts, so a source with hundreds of excerpts stays searchable without
 * loading the raw transcript/document text into the browser to filter it
 * client-side. `projectId` pins the result links to the project currently
 * open rather than wherever tw_search's "earliest referencing project"
 * fallback would otherwise land for a source shared across more than one
 * project — see the migration's own comment. Nullable because Source Detail
 * can show this search box for a document source with no project at all
 * (see DocumentWorkspace's own comment); tw_search's project join can't
 * resolve a hit with no referencing project either way, so this simply
 * scopes to the source alone in that case.
 */
export async function searchSourceAction(
  projectId: string | null,
  sourceId: string,
  query: string,
): Promise<SearchResult[]> {
  await assertToolAccess("transcription");
  return searchArchive(query, { projectId: projectId ?? undefined, sourceId });
}

/** The project workspace's cross-source Excerpts tab — every excerpt across every source this project references. */
export async function listProjectExcerptsAction(projectId: string): Promise<LibraryClip[]> {
  await assertToolAccess("transcription");
  return listLibraryClips(projectId);
}
