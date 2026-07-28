import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess, ForbiddenError } from "@/lib/auth/authz";
import { getSignedMediaUrl } from "@/lib/transcription/storage";
import { renderClipWav } from "@/lib/transcription/export";
import { createZipStream, uniqueEntryName, type ZipEntry } from "@/lib/transcription/zip";
import {
  MAX_CLIPS_ZIP_DURATION_MS,
  TRANSCRIPTION_MEDIA_BUCKET,
  buildClipExportFilename,
  buildClipsZipFilename,
  clipExportObjectPath,
  formatDuration,
} from "@/lib/transcription/media";

/**
 * Every clip in a project as one zip — the "take the whole session to the
 * edit bay" counterpart to the clip rail's per-clip Export WAV (see
 * docs/transcription-workspace-design.md §3E).
 *
 * A route handler rather than a Server Action because the result is a file,
 * not data: actions would have to base64 the whole archive through the RSC
 * payload, whereas this streams entry by entry, so peak memory is one clip's
 * WAV no matter how many clips a project has.
 *
 * Clips that were never exported individually are rendered here and kept in
 * storage exactly as exportClip() does, so the work isn't thrown away — a
 * second download, or a later per-clip Download, reuses the rendered file.
 *
 * Authorization is the RLS-scoped server client plus assertToolAccess, the
 * same pair the clip actions use; nothing here touches the admin client.
 */

// ffmpeg renders sequentially, and a project can hold a lot of clips.
export const runtime = "nodejs";
export const maxDuration = 300;

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: projectId } = await params;

  try {
    await assertToolAccess("transcription");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const supabase = await createClient();

  const { data: project, error: projectError } = await supabase
    .from("tw_projects")
    .select("id, title, interview_date, created_at, media_storage_path")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) {
    console.error("Read failed (this project, for a clip archive):", projectError);
    return NextResponse.json({ error: "Could not load this project. Try again." }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: "That project no longer exists." }, { status: 404 });
  }

  const { data: clips, error: clipsError } = await supabase
    .from("tw_clips")
    .select("id, title, start_ms, end_ms, export_storage_path")
    .eq("project_id", projectId)
    .order("created_at");
  if (clipsError) {
    console.error("Read failed (this project's clips, for a clip archive):", clipsError);
    return NextResponse.json({ error: "Could not load this project's clips." }, { status: 500 });
  }
  if (!clips || clips.length === 0) {
    return NextResponse.json(
      { error: "This project doesn't have any clips yet." },
      { status: 400 },
    );
  }

  const totalDurationMs = clips.reduce((total, clip) => total + (clip.end_ms - clip.start_ms), 0);
  if (totalDurationMs > MAX_CLIPS_ZIP_DURATION_MS) {
    return NextResponse.json(
      {
        error: `That's ${formatDuration(totalDurationMs)} of audio — too much for one archive. Export these clips individually.`,
      },
      { status: 400 },
    );
  }

  // Everything predictable is checked before a single byte goes out: once the
  // stream starts, a failure can only abort a partly-sent response.
  const needsRender = clips.some((clip) => !clip.export_storage_path);
  if (needsRender && !project.media_storage_path) {
    return NextResponse.json({ error: "The source media isn't available." }, { status: 409 });
  }

  const sourceUrl = needsRender ? await getSignedMediaUrl(project.media_storage_path!) : null;
  if (needsRender && !sourceUrl) {
    return NextResponse.json({ error: "Could not access the source media." }, { status: 502 });
  }

  const dateIso = project.interview_date ?? project.created_at;
  const projectTitle = project.title;
  const clipRows = clips;

  async function* entries(): AsyncGenerator<ZipEntry> {
    const taken = new Set<string>();
    for (const clip of clipRows) {
      yield {
        name: uniqueEntryName(buildClipExportFilename(dateIso, projectTitle, clip.title), taken),
        data: await clipAudio(supabase, projectId, clip, sourceUrl),
      };
    }
  }

  return new Response(createZipStream(entries()), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${buildClipsZipFilename(dateIso, project.title)}"`,
      // A clip's audio changes whenever its trim does, and the archive is
      // assembled per request — there is nothing here worth caching.
      "Cache-Control": "no-store",
    },
  });
}

/**
 * One clip's WAV: the already-rendered export when there is one, otherwise a
 * fresh render that is also written back to storage.
 *
 * A recorded export whose object has gone missing falls through to a render
 * rather than failing the archive — the row is repaired on the way past. A
 * storage write that fails is logged and ignored: the caller still gets
 * their audio, and the only thing lost is not having to render it again.
 */
async function clipAudio(
  supabase: SupabaseClient,
  projectId: string,
  clip: { id: string; start_ms: number; end_ms: number; export_storage_path: string | null },
  sourceUrl: string | null,
): Promise<Uint8Array> {
  if (clip.export_storage_path) {
    const { data, error } = await supabase.storage
      .from(TRANSCRIPTION_MEDIA_BUCKET)
      .download(clip.export_storage_path);
    if (data) return new Uint8Array(await data.arrayBuffer());
    console.error(
      `Clip export missing from storage (${clip.export_storage_path}), re-rendering:`,
      error,
    );
  }

  if (!sourceUrl) {
    throw new Error(`No source media to render clip ${clip.id} from`);
  }

  const wav = await renderClipWav(sourceUrl, clip.start_ms, clip.end_ms);
  await storeRenderedClip(supabase, projectId, clip.id, wav);
  return wav;
}

async function storeRenderedClip(
  supabase: SupabaseClient,
  projectId: string,
  clipId: string,
  wav: Buffer,
): Promise<void> {
  const exportPath = clipExportObjectPath(projectId, clipId);
  const { error: uploadError } = await supabase.storage
    .from(TRANSCRIPTION_MEDIA_BUCKET)
    .upload(exportPath, wav, { contentType: "audio/wav", upsert: true });
  if (uploadError) {
    console.error(`Could not keep the rendered clip ${clipId}:`, uploadError);
    return;
  }

  const { error } = await supabase
    .from("tw_clips")
    .update({ export_storage_path: exportPath, exported_at: new Date().toISOString() })
    .eq("id", clipId);
  if (error) console.error(`Could not record the export for clip ${clipId}:`, error);
}
