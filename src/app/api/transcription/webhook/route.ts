import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTranscriptionProvider } from "@/lib/transcription/asr";
import { reindexProject } from "@/lib/transcription/indexing";
import { WEBHOOK_AUTH_HEADER_NAME } from "@/lib/transcription/providers/assemblyai";

// Called by the ASR provider (never by a signed-in user) when a
// transcription job finishes — see docs/transcription-workspace-design.md
// §6. Uses the admin client, since there is no Supabase session for RLS to
// apply against; the shared-secret check below is what stands in for it, so
// it must run before anything else. See lib/supabase/admin.ts's comment for
// why this is a deliberate, narrow exception to "admin client only for
// auth.admin.* calls".
function isAuthorized(request: Request): boolean {
  const expected = process.env.TRANSCRIPTION_WEBHOOK_SECRET;
  const provided = request.headers.get(WEBHOOK_AUTH_HEADER_NAME);
  if (!expected || !provided) return false;

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { transcript_id?: string } | null;
  const providerJobId = body?.transcript_id;
  if (!providerJobId) {
    return NextResponse.json({ error: "Missing transcript_id" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: project } = await supabase
    .from("tw_projects")
    .select("id")
    .eq("transcription_provider_job_id", providerJobId)
    .maybeSingle();

  // Nothing to do — an unrecognized or already-processed job id. Acknowledge
  // rather than error, so the provider doesn't keep retrying the callback.
  if (!project) {
    return NextResponse.json({ ok: true });
  }

  try {
    const result = await getTranscriptionProvider().fetchResult(providerJobId);
    const validUtterances = result.utterances.filter((u) => u.endMs > u.startMs);

    // Clean slate for this project's transcript. Acceptable for Phase 2:
    // a retry always means starting fresh, and nothing downstream (speaker
    // naming, transcript edits, clips) exists yet to lose — see design doc's
    // phased plan.
    await supabase.from("tw_segments").delete().eq("project_id", project.id);
    await supabase.from("tw_speakers").delete().eq("project_id", project.id);

    const speakerLabels = [...new Set(validUtterances.map((u) => u.speakerLabel))];
    const speakerIdByLabel = new Map<string, string>();
    if (speakerLabels.length > 0) {
      const { data: speakers } = await supabase
        .from("tw_speakers")
        .insert(
          speakerLabels.map((diarization_label) => ({ project_id: project.id, diarization_label })),
        )
        .select("id, diarization_label");
      for (const speaker of speakers ?? []) {
        speakerIdByLabel.set(speaker.diarization_label, speaker.id);
      }
    }

    if (validUtterances.length > 0) {
      await supabase.from("tw_segments").insert(
        validUtterances.map((u, index) => ({
          project_id: project.id,
          speaker_id: speakerIdByLabel.get(u.speakerLabel) ?? null,
          position: index,
          start_ms: u.startMs,
          end_ms: u.endMs,
          text: u.text,
          words: u.words,
        })),
      );
    }

    await supabase
      .from("tw_projects")
      .update({ status: "ready", transcribed_at: new Date().toISOString(), error_message: null })
      .eq("id", project.id);

    // Build the search index while the transcript is fresh, so a project is
    // findable the moment it's ready rather than after someone remembers to
    // reindex it. Deliberately after the status flip and deliberately
    // swallowed: a chunking or embeddings failure must not turn a transcript
    // that landed perfectly well into a failed project. The rows stay flagged
    // stale and the workspace's "Rebuild search index" action picks them up.
    try {
      await reindexProject(supabase, project.id);
    } catch (indexError) {
      console.error("[transcription] indexing after webhook failed", {
        projectId: project.id,
        error: indexError,
      });
    }
  } catch (error) {
    await supabase
      .from("tw_projects")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Transcription failed.",
      })
      .eq("id", project.id);
  }

  return NextResponse.json({ ok: true });
}
