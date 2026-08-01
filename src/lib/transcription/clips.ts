import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { getPrimarySourceForProject } from "@/lib/transcription/projects";
import type { SwSourceKind } from "@/lib/database.types";

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
 * A project's clips (source excerpts), oldest first. Scoped to temporal
 * (audio/video) excerpts — this is the type ClipRail/ClipComposer render,
 * both inherently time-based (word-highlighting, waveform-adjacent trim
 * controls). Document excerpts have their own summary type and list
 * function — see lib/transcription/document-excerpts.ts.
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
      .eq("locator_kind", "temporal")
      .order("created_at"),
    "this source's excerpts",
  );

  // Guaranteed non-null by the locator_kind = 'temporal' filter above and
  // the sw_source_excerpts_locator_check constraint that enforces it.
  return (clips ?? []).map((clip) => ({
    id: clip.id,
    title: clip.title,
    startMs: clip.start_ms!,
    endMs: clip.end_ms!,
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
export interface LibraryClip {
  id: string;
  title: string;
  excerpt: string;
  exportedAt: string | null;
  /** Whether a rendered WAV already exists (temporal excerpts only) — the download URL is signed on demand. */
  hasExport: boolean;
  locatorKind: "temporal" | "document";
  /** Temporal excerpts only. */
  startMs: number | null;
  endMs: number | null;
  /** Document excerpts only — the first spanned page, for display and deep-linking. */
  pageNumber: number | null;
  /** The source this clip belongs to — a project can reference more than one (Phase 3a), so a link into the project also needs this to land on the right pill. */
  sourceId: string;
  sourceKind: SwSourceKind;
  projectId: string;
  projectTitle: string;
  /** The project's background text: what this recording was (design doc §3G). */
  projectDescription: string | null;
  interviewDate: string | null;
}

/**
 * Every excerpt across every project, newest first — the browse half of the
 * Excerpts library (design doc §3F, extended by §8.7 to cover document
 * excerpts), for "I know we have this quote/passage somewhere" when a
 * search query isn't the right way to ask. Both temporal (audio/video) and
 * document excerpts are returned — see locatorKind.
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
    .select(
      "id, source_id, title, locator_kind, start_ms, end_ms, excerpt_text, export_storage_path, exported_at",
    )
    .order("created_at", { ascending: false });
  if (sourceIdFilter) query = query.in("source_id", sourceIdFilter);

  const clips = unwrapRead(await query, "the clip library") ?? [];
  if (clips.length === 0) return [];

  const sourceIds = [...new Set(clips.map((clip) => clip.source_id))];
  const documentExcerptIds = clips
    .filter((clip) => clip.locator_kind === "document")
    .map((clip) => clip.id);

  const [linkResult, sourceResult, locationResult] = await Promise.all([
    supabase
      .from("sw_project_sources")
      .select("project_id, source_id, added_at")
      .in("source_id", sourceIds)
      .order("added_at"),
    supabase.from("sw_sources").select("id, kind, interview_date").in("id", sourceIds),
    documentExcerptIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("sw_excerpt_document_locations")
          .select("excerpt_id, page_number, sequence")
          .in("excerpt_id", documentExcerptIds)
          .order("sequence"),
  ]);
  const links = unwrapRead(linkResult, "the projects these clips came from");
  const sources = unwrapRead(sourceResult, "the sources these clips came from");
  const locations = unwrapRead(locationResult, "these excerpts' page locations");

  const projectIdBySourceId = new Map<string, string>();
  for (const link of links ?? []) {
    if (!projectIdBySourceId.has(link.source_id)) {
      projectIdBySourceId.set(link.source_id, link.project_id);
    }
  }

  const sourceById = new Map((sources ?? []).map((s) => [s.id, s]));

  const firstPageByExcerptId = new Map<string, number>();
  for (const location of locations ?? []) {
    if (!firstPageByExcerptId.has(location.excerpt_id)) {
      firstPageByExcerptId.set(location.excerpt_id, location.page_number);
    }
  }

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
      excerpt: clip.excerpt_text,
      exportedAt: clip.exported_at,
      hasExport: Boolean(clip.export_storage_path),
      locatorKind: clip.locator_kind,
      startMs: clip.start_ms,
      endMs: clip.end_ms,
      pageNumber: firstPageByExcerptId.get(clip.id) ?? null,
      sourceId: clip.source_id,
      sourceKind: sourceById.get(clip.source_id)?.kind ?? "audio_video",
      projectId: projectId ?? "",
      projectTitle: project?.title ?? "Unknown project",
      projectDescription: project?.description ?? null,
      interviewDate: sourceById.get(clip.source_id)?.interview_date ?? null,
    };
  });
}
