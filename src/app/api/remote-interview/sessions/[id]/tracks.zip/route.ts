import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess, ForbiddenError } from "@/lib/auth/authz";
import { REMOTE_INTERVIEW_MEDIA_BUCKET, trackDownloadFilename } from "@/lib/remote-interview/media";
import { createZipStream, uniqueEntryName, type ZipEntry } from "@/lib/transcription/zip";

/**
 * Every assembled track in a session as one zip — the detail screen's
 * "download-all" (design doc §4). A route handler rather than a Server
 * Action for the same reason as the Transcription Workspace's clips.zip:
 * the result is a file, not data, and streaming keeps peak memory to one
 * track at a time rather than base64ing the whole archive through the RSC
 * payload. createZipStream/uniqueEntryName are lib/transcription/zip's
 * generic, schema-agnostic zip writer — reused as-is rather than
 * duplicated, since nothing about it is transcription-specific.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: sessionId } = await params;

  try {
    await assertToolAccess("remote-interview");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const supabase = await createClient();

  const { data: session, error: sessionError } = await supabase
    .from("ri_sessions")
    .select("id, title")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) {
    console.error("Read failed (this session, for a track archive):", sessionError);
    return NextResponse.json({ error: "Could not load this session." }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ error: "That session no longer exists." }, { status: 404 });
  }

  const { data: participants, error: participantsError } = await supabase
    .from("ri_participants")
    .select("id, display_name")
    .eq("session_id", sessionId);
  if (participantsError) {
    console.error("Read failed (this session's participants, for a track archive):", participantsError);
    return NextResponse.json({ error: "Could not load this session's participants." }, { status: 500 });
  }
  const displayNameById = new Map((participants ?? []).map((p) => [p.id, p.display_name]));

  const { data: tracks, error: tracksError } = await supabase
    .from("ri_tracks")
    .select("id, participant_id, source, run_index, content_type, storage_path")
    .in("participant_id", [...displayNameById.keys()])
    .not("storage_path", "is", null);
  if (tracksError) {
    console.error("Read failed (this session's tracks, for a track archive):", tracksError);
    return NextResponse.json({ error: "Could not load this session's tracks." }, { status: 500 });
  }
  if (!tracks || tracks.length === 0) {
    return NextResponse.json(
      { error: "No assembled tracks are available for this session yet." },
      { status: 400 },
    );
  }

  const trackRows = tracks;

  async function* entries(): AsyncGenerator<ZipEntry> {
    const taken = new Set<string>();
    for (const track of trackRows) {
      const { data, error } = await supabase.storage
        .from(REMOTE_INTERVIEW_MEDIA_BUCKET)
        .download(track.storage_path!);
      if (error || !data) {
        console.error(`Could not read track ${track.id} for the archive:`, error);
        continue;
      }
      const name = uniqueEntryName(
        trackDownloadFilename({
          displayName: displayNameById.get(track.participant_id) ?? "participant",
          source: track.source,
          runIndex: track.run_index,
          contentType: track.content_type,
        }),
        taken,
      );
      yield { name, data: new Uint8Array(await data.arrayBuffer()) };
    }
  }

  const safeTitle = session.title.replace(/[\\/:*?"<>|]/g, "_").trim() || "session";

  return new Response(createZipStream(entries()), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeTitle} - tracks.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
