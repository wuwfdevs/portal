/**
 * Where Sourcework's two screens live, built in one place so a link to a
 * source can't forget which project it was reached from.
 *
 * The project screen (`/sourcework/[id]`) is about the project: its sources and
 * its excerpts. The source screen (`/sourcework/sources/[id]`) is the working
 * surface for one recording or document. `project` on a source link is only the
 * context — it picks the back link and which project an action is about — and
 * a source reached without it (from the library) is still the same source.
 */

export function piecePath(projectId: string, pieceId: string): string {
  return `/sourcework/${projectId}/pieces/${pieceId}`;
}

export function themePath(projectId: string, themeId: string): string {
  return `/sourcework/${projectId}/themes/${themeId}`;
}

export function projectPath(
  projectId: string,
  view?: "themes" | "excerpts" | "pieces" | "setup",
): string {
  return view ? `/sourcework/${projectId}?view=${view}` : `/sourcework/${projectId}`;
}

export function sourcePath(
  sourceId: string,
  options: {
    projectId?: string | null;
    /** Where to put the playhead, in milliseconds. */
    t?: number | null;
    /** The page to open a document on. */
    page?: number | null;
    /** The excerpt to mark and surface. */
    clip?: string | null;
  } = {},
): string {
  const params = new URLSearchParams();
  if (options.projectId) params.set("project", options.projectId);
  if (options.t !== null && options.t !== undefined) params.set("t", String(options.t));
  else if (options.page !== null && options.page !== undefined)
    params.set("page", String(options.page));
  if (options.clip) params.set("clip", options.clip);
  const query = params.toString();
  return `/sourcework/sources/${sourceId}${query ? `?${query}` : ""}`;
}
