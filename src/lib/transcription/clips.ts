import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSignedMediaUrl } from "@/lib/transcription/storage";
import { buildClipExportFilename } from "@/lib/transcription/media";

export interface ProjectClip {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  excerpt: string;
  exportedAt: string | null;
  downloadUrl: string | null;
}

/**
 * A project's clips, oldest first, each with a signed download URL already
 * resolved if it's been exported before — so the clip rail can offer
 * "Download" immediately on page load, not just right after a fresh export.
 */
export async function listClipsForProject(projectId: string): Promise<ProjectClip[]> {
  const supabase = await createClient();
  const [{ data: clips }, { data: project }] = await Promise.all([
    supabase
      .from("tw_clips")
      .select("id, title, start_ms, end_ms, excerpt, export_storage_path, exported_at")
      .eq("project_id", projectId)
      .order("created_at"),
    supabase
      .from("tw_projects")
      .select("title, interview_date, created_at")
      .eq("id", projectId)
      .maybeSingle(),
  ]);

  const projectTitle = project?.title ?? "interview";
  const projectDate = project?.interview_date ?? project?.created_at ?? new Date().toISOString();

  return Promise.all(
    (clips ?? []).map(async (clip) => ({
      id: clip.id,
      title: clip.title,
      startMs: clip.start_ms,
      endMs: clip.end_ms,
      excerpt: clip.excerpt,
      exportedAt: clip.exported_at,
      downloadUrl: clip.export_storage_path
        ? await getSignedMediaUrl(
            clip.export_storage_path,
            buildClipExportFilename(projectDate, projectTitle, clip.title),
          )
        : null,
    })),
  );
}
