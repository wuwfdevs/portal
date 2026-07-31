import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { getPrimarySourceForProject } from "@/lib/transcription/projects";

export interface ProjectClip {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  excerpt: string;
  exportedAt: string | null;
  /** Whether a rendered WAV already exists — the download URL is signed on demand. */
  hasExport: boolean;
}

/**
 * A project's clips (source excerpts), oldest first.
 *
 * Deliberately does not resolve signed download URLs here. Signing at
 * render time bakes a short-lived URL into the page, so a workspace left
 * open long enough hands the reporter a Download link that 400s. The clip
 * rail calls getClipDownloadUrl() at click time instead.
 */
async function fetchExcerptsForSource(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceId: string,
): Promise<ProjectClip[]> {
  const clips = unwrapRead(
    await supabase
      .from("sw_source_excerpts")
      .select("id, title, start_ms, end_ms, excerpt_text, export_storage_path, exported_at")
      .eq("source_id", sourceId)
      .order("created_at"),
    "this source's excerpts",
  );

  return (clips ?? []).map((clip) => ({
    id: clip.id,
    title: clip.title,
    startMs: clip.start_ms,
    endMs: clip.end_ms,
    excerpt: clip.excerpt_text,
    exportedAt: clip.exported_at,
    hasExport: Boolean(clip.export_storage_path),
  }));
}

/**
 * A source's excerpts directly, independent of which project is open —
 * what the workspace's active source pill uses (a project's "primary"
 * source is just the pill that happens to be selected by default) and what
 * Source Detail's "excerpts here" list uses.
 */
export async function listExcerptsForSource(sourceId: string): Promise<ProjectClip[]> {
  const supabase = await createClient();
  return fetchExcerptsForSource(supabase, sourceId);
}

export async function listClipsForProject(projectId: string): Promise<ProjectClip[]> {
  const supabase = await createClient();
  const ref = await getPrimarySourceForProject(supabase, projectId);
  if (!ref) return [];
  return fetchExcerptsForSource(supabase, ref.sourceId);
}

/** A clip as it appears outside its own project — carrying the recording it came from. */
export interface LibraryClip extends ProjectClip {
  /** The source this clip belongs to — a project can reference more than one (Phase 3a), so a link into the project also needs this to land on the right pill. */
  sourceId: string;
  projectId: string;
  projectTitle: string;
  /** The project's background text: what this recording was (design doc §3G). */
  projectDescription: string | null;
  interviewDate: string | null;
}

/**
 * Every clip across every project, newest first — the browse half of the clip
 * library (design doc §3F), for "I know we have the mayor saying this"
 * when a search query isn't the right way to ask.
 *
 * Flat queries rather than an embedded select, same reason as
 * getTranscriptForRepresentation: database.types.ts is hand-written with
 * empty Relationships, so PostgREST embedding doesn't type reliably.
 */
export async function listLibraryClips(projectId?: string): Promise<LibraryClip[]> {
  const supabase = await createClient();

  let sourceIdFilter: string[] | null = null;
  if (projectId) {
    const ref = await getPrimarySourceForProject(supabase, projectId);
    if (!ref) return [];
    sourceIdFilter = [ref.sourceId];
  }

  let query = supabase
    .from("sw_source_excerpts")
    .select("id, source_id, title, start_ms, end_ms, excerpt_text, export_storage_path, exported_at")
    .order("created_at", { ascending: false });
  if (sourceIdFilter) query = query.in("source_id", sourceIdFilter);

  const clips = unwrapRead(await query, "the clip library") ?? [];
  if (clips.length === 0) return [];

  const sourceIds = [...new Set(clips.map((clip) => clip.source_id))];
  const links =
    unwrapRead(
      await supabase
        .from("sw_project_sources")
        .select("project_id, source_id, added_at")
        .in("source_id", sourceIds)
        .order("added_at"),
      "the projects these clips came from",
    ) ?? [];
  const projectIdBySourceId = new Map<string, string>();
  for (const link of links) {
    if (!projectIdBySourceId.has(link.source_id)) {
      projectIdBySourceId.set(link.source_id, link.project_id);
    }
  }

  const sources =
    unwrapRead(
      await supabase.from("sw_sources").select("id, interview_date").in("id", sourceIds),
      "the sources these clips came from",
    ) ?? [];
  const sourceById = new Map(sources.map((s) => [s.id, s]));

  const projectIds = [...new Set(projectIdBySourceId.values())];
  const projects =
    projectIds.length === 0
      ? []
      : (unwrapRead(
          await supabase.from("tw_projects").select("id, title, description").in("id", projectIds),
          "the projects these clips came from",
        ) ?? []);
  const projectById = new Map(projects.map((project) => [project.id, project]));

  return clips.map((clip) => {
    const projectId = projectIdBySourceId.get(clip.source_id) ?? null;
    const project = projectId ? projectById.get(projectId) : undefined;
    return {
      id: clip.id,
      title: clip.title,
      startMs: clip.start_ms,
      endMs: clip.end_ms,
      excerpt: clip.excerpt_text,
      exportedAt: clip.exported_at,
      hasExport: Boolean(clip.export_storage_path),
      sourceId: clip.source_id,
      projectId: projectId ?? "",
      projectTitle: project?.title ?? "Unknown project",
      projectDescription: project?.description ?? null,
      interviewDate: sourceById.get(clip.source_id)?.interview_date ?? null,
    };
  });
}
