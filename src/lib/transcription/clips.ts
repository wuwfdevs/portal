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
