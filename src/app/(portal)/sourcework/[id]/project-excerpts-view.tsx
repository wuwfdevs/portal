"use client";

import { ClipLibrary } from "@/components/transcription/clip-library";
import { ScopedSearchPanel } from "@/components/transcription/scoped-search-panel";
import type { LibraryClip } from "@/lib/transcription/clips";
import { searchProjectAction } from "./workspace-search-actions";

/** Every excerpt across the project's sources, behind a search scoped to the project. */
export function ProjectExcerptsView({
  projectId,
  clips,
}: {
  projectId: string;
  clips: LibraryClip[];
}) {
  return (
    <ScopedSearchPanel
      placeholder="Search this project's transcripts, documents, and excerpts…"
      onSearch={(query) => searchProjectAction(projectId, query)}
    >
      <ClipLibrary clips={clips} showProjectMeta={false} showFilter={false} />
    </ScopedSearchPanel>
  );
}
