import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";

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
 * A project's clips, oldest first.
 *
 * Deliberately does not resolve signed download URLs here. Signing at
 * render time bakes a short-lived URL into the page, so a workspace left
 * open long enough hands the reporter a Download link that 400s. The clip
 * rail calls getClipDownloadUrl() at click time instead.
 */
export async function listClipsForProject(projectId: string): Promise<ProjectClip[]> {
  const supabase = await createClient();
  const clips = unwrapRead(
    await supabase
      .from("tw_clips")
      .select("id, title, start_ms, end_ms, excerpt, export_storage_path, exported_at")
      .eq("project_id", projectId)
      .order("created_at"),
    "this project's clips",
  );

  return (clips ?? []).map((clip) => ({
    id: clip.id,
    title: clip.title,
    startMs: clip.start_ms,
    endMs: clip.end_ms,
    excerpt: clip.excerpt,
    exportedAt: clip.exported_at,
    hasExport: Boolean(clip.export_storage_path),
  }));
}

/** A clip as it appears outside its own project — carrying the recording it came from. */
export interface LibraryClip extends ProjectClip {
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
 * Two queries rather than an embedded select, for the same reason
 * getTranscriptForProject uses two: database.types.ts is hand-written with
 * empty Relationships, so PostgREST embedding doesn't type reliably.
 */
export async function listLibraryClips(projectId?: string): Promise<LibraryClip[]> {
  const supabase = await createClient();

  let query = supabase
    .from("tw_clips")
    .select("id, project_id, title, start_ms, end_ms, excerpt, export_storage_path, exported_at")
    .order("created_at", { ascending: false });
  if (projectId) query = query.eq("project_id", projectId);

  const clips = unwrapRead(await query, "the clip library") ?? [];
  if (clips.length === 0) return [];

  const projects =
    unwrapRead(
      await supabase
        .from("tw_projects")
        .select("id, title, description, interview_date")
        .in("id", [...new Set(clips.map((clip) => clip.project_id))]),
      "the projects these clips came from",
    ) ?? [];
  const projectById = new Map(projects.map((project) => [project.id, project]));

  return clips.map((clip) => {
    const project = projectById.get(clip.project_id);
    return {
      id: clip.id,
      title: clip.title,
      startMs: clip.start_ms,
      endMs: clip.end_ms,
      excerpt: clip.excerpt,
      exportedAt: clip.exported_at,
      hasExport: Boolean(clip.export_storage_path),
      projectId: clip.project_id,
      projectTitle: project?.title ?? "Unknown project",
      projectDescription: project?.description ?? null,
      interviewDate: project?.interview_date ?? null,
    };
  });
}
