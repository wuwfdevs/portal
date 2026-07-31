import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hasToolAccess } from "@/lib/auth/authz";
import { getToolByKey } from "@/lib/tools";
import { getSiteUrl } from "@/lib/site-url";
import { TRANSCRIPTION_MEDIA_BUCKET, sourceObjectPath } from "@/lib/transcription/media";
import { createProjectWithSource, startTranscriptionForProject } from "@/lib/transcription/ingest";
import {
  AUDIENCE_LISTENING_MEDIA_BUCKET,
  normalizeContentType,
} from "@/lib/audience-listening/media";
import { buildProjectTitle, buildProvenance } from "@/lib/audience-listening/provenance";

/**
 * Handing one answer to the Transcription Workspace.
 *
 * There is no second ASR pipeline here, no second webhook, no second provider
 * adapter, and no transcript storage: this creates a normal `tw_projects` row
 * and calls the same `startTranscriptionForProject()` the Transcription
 * Workspace's own upload path calls (extracted to lib/transcription/ingest.ts
 * so there is one place the provider is invoked from). Audience Listening then
 * only ever *shows* that project's status and links to it.
 *
 * One answer becomes one project because the Transcription Workspace models one
 * source media file per project — see docs/audience-listening-design.md §2,
 * constraint 3. The grouping stays here, where it means something.
 */

export type HandoffResult = { ok: true; projectId: string } | { ok: false; message: string };

/**
 * Creates the project, copies the audio, and kicks off transcription.
 *
 * Runs entirely as the calling staff member under RLS — there is no admin
 * client anywhere in this path. That is also why the transcription grant is
 * checked explicitly first: without it the `tw_projects` insert simply returns
 * no row, and "could not create the project" would be the least useful possible
 * description of "you don't have access to the other tool".
 */
export async function sendAnswerToTranscription(answerId: string): Promise<HandoffResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Your session expired. Sign in again." };

  const transcriptionTool = await getToolByKey("transcription");
  if (!transcriptionTool || !(await hasToolAccess(user.id, transcriptionTool.id))) {
    return {
      ok: false,
      message:
        "Sending an answer to transcription needs Sourcework access as well. Ask an administrator to grant it.",
    };
  }

  const { data: answer, error: answerError } = await supabase
    .from("al_answers")
    .select("*")
    .eq("id", answerId)
    .maybeSingle();
  if (answerError) {
    console.error("Could not read the answer for handoff:", answerError);
    return { ok: false, message: `Could not read the answer: ${answerError.message}` };
  }
  if (!answer) return { ok: false, message: "That answer no longer exists." };
  if (answer.status !== "uploaded") {
    return { ok: false, message: "That answer has no completed audio to transcribe." };
  }

  const [{ data: submission }, { data: query }, { count: questionCount }] = await Promise.all([
    supabase.from("al_submissions").select("*").eq("id", answer.submission_id).maybeSingle(),
    supabase.from("al_queries").select("*").eq("id", answer.query_id).maybeSingle(),
    supabase
      .from("al_questions")
      .select("id", { count: "exact", head: true })
      .eq("query_id", answer.query_id),
  ]);
  if (!submission || !query) {
    return { ok: false, message: "Could not load this answer's submission." };
  }

  const contentType = normalizeContentType(answer.content_type);

  const created = await createProjectWithSource(supabase, {
    title: buildProjectTitle({ query, submission, answer }),
    description: buildProvenance({
      query,
      submission,
      answer,
      questionCount: questionCount ?? 0,
      siteUrl: getSiteUrl(),
    }),
    interviewDate: submission.submitted_at?.slice(0, 10) ?? null,
    createdBy: user.id,
  });

  if ("error" in created) {
    console.error("Could not create the transcription project:", created.error);
    return {
      ok: false,
      message: `Could not create the transcription project: ${created.error}`,
    };
  }
  const { projectId, sourceId } = created;

  // Copy, never move: the participant's original stays in
  // audience-listening-media untouched (design doc §2, constraint 4). Done as
  // download-then-upload rather than storage copy() with destinationBucket —
  // that API would avoid the round trip but is unverified against this
  // project's storage version, and an answer is at most a few megabytes.
  const destinationPath = sourceObjectPath(sourceId, contentType);
  const { data: file, error: downloadError } = await supabase.storage
    .from(AUDIENCE_LISTENING_MEDIA_BUCKET)
    .download(answer.storage_path);

  if (downloadError || !file) {
    await failSource(supabase, sourceId, "Could not read the participant's audio.");
    return { ok: false, message: "Could not read the participant's audio file." };
  }

  const { error: uploadError } = await supabase.storage
    .from(TRANSCRIPTION_MEDIA_BUCKET)
    .upload(destinationPath, file, { contentType, upsert: true });

  if (uploadError) {
    await failSource(supabase, sourceId, `Could not copy the audio: ${uploadError.message}`);
    return { ok: false, message: `Could not copy the audio: ${uploadError.message}` };
  }

  const { error: updateError } = await supabase
    .from("sw_sources")
    .update({
      original_storage_path: destinationPath,
      original_content_type: contentType,
      original_size_bytes: answer.size_bytes,
      original_duration_ms: answer.duration_ms,
      status: "ready",
      error_message: null,
    })
    .eq("id", sourceId);

  if (updateError) {
    await failSource(
      supabase,
      sourceId,
      `Could not save the media details: ${updateError.message}`,
    );
    return { ok: false, message: `Could not save the media details: ${updateError.message}` };
  }

  const started = await startTranscriptionForProject(supabase, {
    projectId,
    storagePath: destinationPath,
  });

  // The project exists and holds the audio either way, so the link is worth
  // keeping even when the ASR kickoff itself failed — the Transcription
  // Workspace has its own retry for that half.
  const { error: linkError } = await supabase
    .from("al_answers")
    .update({
      transcription_state: started.error ? "failed" : "sent",
      transcription_project_id: projectId,
      transcription_error: started.error ?? null,
    })
    .eq("id", answerId);

  if (linkError) {
    console.error("Could not record the transcription link on the answer:", linkError);
  }

  if (started.error) return { ok: false, message: started.error };
  return { ok: true, projectId };
}

async function failSource(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceId: string,
  message: string,
): Promise<void> {
  await supabase
    .from("sw_sources")
    .update({ status: "failed", error_message: message })
    .eq("id", sourceId);
}

/**
 * Drains a query's `queued` answers — the automatic-transcription path.
 *
 * "Automatic" here is automatic *eligibility*, not background processing: this
 * repository has no job queue (the Remote Interview design doc says so, and its
 * own assembly step is host-triggered for the same reason), so finalizing a
 * submission on an automatic query marks its answers queued and a staff member
 * drains them in one click. Bounded per call so one press can't tie up a
 * request for minutes.
 */
export const MAX_QUEUE_DRAIN = 25;

export async function sendQueuedAnswers(
  queryId: string,
): Promise<{ sent: number; failed: number; message: string | null }> {
  const supabase = await createClient();
  const { data: queued, error } = await supabase
    .from("al_answers")
    .select("id")
    .eq("query_id", queryId)
    .eq("transcription_state", "queued")
    .eq("status", "uploaded")
    .limit(MAX_QUEUE_DRAIN);

  if (error) {
    console.error("Could not read the transcription queue:", error);
    return { sent: 0, failed: 0, message: `Could not read the queue: ${error.message}` };
  }

  let sent = 0;
  let failed = 0;
  let firstMessage: string | null = null;

  for (const answer of queued ?? []) {
    const result = await sendAnswerToTranscription(answer.id);
    if (result.ok) {
      sent += 1;
    } else {
      failed += 1;
      firstMessage ??= result.message;
    }
  }

  return { sent, failed, message: firstMessage };
}
