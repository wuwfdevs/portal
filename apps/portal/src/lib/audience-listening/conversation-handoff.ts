import "server-only";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@/lib/supabase/server";
import { canUseTool } from "@/lib/auth/authz";
import type { ActionResult } from "@/lib/action-response";
import { AUDIENCE_LISTENING_MEDIA_BUCKET } from "@/lib/audience-listening/media";
import { TRANSCRIPTION_MEDIA_BUCKET, sourceObjectPath } from "@/lib/transcription/media";
import { createProjectWithSource, createSourceForExistingProject, startTranscriptionForProject } from "@/lib/transcription/ingest";
import { getSourceRef } from "@/lib/transcription/projects";
import { speakerRangeFor } from "@/lib/transcription/speaker-identification";
import { stationTodayISO } from "@/lib/station-time";
import {
  CONCAT_FFMPEG_ARGS,
  concatListFile,
  orderSegments,
  segmentExtension,
  sourceDescription,
  sourceTitle,
} from "./conversation-media";

/**
 * Sending a table's recording to Sourcework (design §8). A campaign is one Sourcework project and each table is a source in it, so the
 * first table sent makes the project and remembers it on the campaign. The segments are joined into one MP3 with ffmpeg and copied
 * into Sourcework's bucket; the originals stay where they are. There is no second ASR pipeline: this calls the same
 * startTranscriptionForProject() everything else calls. Runs as the staff member, under RLS: no admin client, and the grant on
 * Sourcework is checked first so a missing grant reads as that and not as "could not create the project".
 *
 * A button on the Table page, and the scheduled route's first task (api/cron/listening) for a conversation nobody has sent.
 */

export type ConversationHandoffResult = ActionResult<{ projectId: string; sourceId: string }>;

type Supabase = Awaited<ReturnType<typeof createClient>>;

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg is not available on this server."));
      return;
    }
    const child = spawn(ffmpegPath, args);
    const stderr: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${Buffer.concat(stderr).toString("utf-8").trim().slice(0, 400)}`));
    });
  });
}

async function failSource(supabase: Supabase, sourceId: string, message: string): Promise<void> {
  const { error } = await supabase.from("sw_sources").update({ status: "failed", error_message: message }).eq("id", sourceId);
  if (error) console.error("Could not mark the handed-off source failed:", error);
}

export async function sendConversationToSourcework(conversationId: string): Promise<ConversationHandoffResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };
  if (!(await canUseTool(user, "transcription"))) {
    return {
      ok: false,
      error: "Sending a recording to transcription needs Sourcework, and either it is switched off or you don't have access to it. Ask an administrator.",
    };
  }
  return sendConversationAs(supabase, user.id, conversationId);
}

/**
 * The hand-off itself, as `userId`, through `supabase`. A staff member's button passes their own RLS client; the scheduled route passes
 * the service client and the campaign's owner, who must have Sourcework (`canUseTool` is checked by the caller either way). Everything
 * Sourcework records ("created by") is that user, so a recording sent overnight belongs to the person who owns the season.
 */
export async function sendConversationAs(supabase: Supabase, userId: string, conversationId: string): Promise<ConversationHandoffResult> {
  const user = { id: userId };
  const { data: conversation, error: conversationError } = await supabase.from("al_conversations").select("*").eq("id", conversationId).maybeSingle();
  if (conversationError) return { ok: false, error: `Could not read the conversation: ${conversationError.message}` };
  if (!conversation) return { ok: false, error: "That conversation no longer exists." };
  if (conversation.sourcework_source_id) return { ok: false, error: "This recording is already in Sourcework." };
  // A facilitator may have sent the conversation before staff started the transcript. The recording is whole either way (the segment
  // check below refuses a gap), so it is handed off, and a conversation already marked sent stays sent.
  if (conversation.status !== "complete" && conversation.status !== "sent") {
    return { ok: false, error: "Only a complete recording can be sent: the table has to have ended and every segment uploaded." };
  }

  const [tableResult, eventResult, segmentResult] = await Promise.all([
    supabase.from("al_tables").select("number, expected_speakers").eq("id", conversation.table_id).maybeSingle(),
    supabase.from("al_events").select("title, place_name, starts_at, campaign_id").eq("id", conversation.event_id).maybeSingle(),
    supabase.from("al_conversation_segments").select("seq, status, storage_path, content_type").eq("conversation_id", conversationId),
  ]);
  const readError = tableResult.error ?? eventResult.error ?? segmentResult.error;
  if (readError) return { ok: false, error: `Could not read the table: ${readError.message}` };
  const table = tableResult.data;
  const event = eventResult.data;
  if (!table || !event) return { ok: false, error: "Could not find this conversation's table or event." };

  const campaignResult = await supabase.from("al_campaigns").select("id, title, question, sourcework_project_id").eq("id", event.campaign_id).maybeSingle();
  if (campaignResult.error || !campaignResult.data) return { ok: false, error: "Could not find this conversation's campaign." };
  const campaign = campaignResult.data;

  const ordered = orderSegments(segmentResult.data ?? [], conversation.last_seq);
  if (!ordered.ok) return { ok: false, error: ordered.error };

  // Join the segments into one recording in a private temporary directory, removed whatever happens.
  const dir = await mkdtemp(join(tmpdir(), "al-conversation-"));
  let audio: Buffer;
  try {
    const paths: string[] = [];
    for (const segment of ordered.segments) {
      const { data: file, error } = await supabase.storage.from(AUDIENCE_LISTENING_MEDIA_BUCKET).download(segment.storage_path);
      if (error || !file) return { ok: false, error: `Could not read segment ${segment.seq} of the recording.` };
      const path = join(dir, `${segment.seq}.${segmentExtension(segment.content_type)}`);
      await writeFile(path, Buffer.from(await file.arrayBuffer()));
      paths.push(path);
    }
    const listPath = join(dir, "list.txt");
    const outputPath = join(dir, "recording.mp3");
    await writeFile(listPath, concatListFile(paths));
    await runFfmpeg(CONCAT_FFMPEG_ARGS(listPath, outputPath));
    audio = await readFile(outputPath);
  } catch (error) {
    console.error("Could not assemble a conversation's recording:", error);
    return { ok: false, error: `Could not join the segments into one recording: ${error instanceof Error ? error.message : "unknown error"}` };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  const title = sourceTitle(event, table.number);
  const description = sourceDescription({
    campaignTitle: campaign.title,
    question: campaign.question,
    eventTitle: event.title,
    placeName: event.place_name,
    tableNumber: table.number,
    startsAt: event.starts_at,
  });
  const interviewDate = stationTodayISO(event.starts_at);

  // The first table sent makes the campaign's project; later tables are sources in it.
  let projectId = campaign.sourcework_project_id;
  let sourceId: string;
  if (projectId) {
    const created = await createSourceForExistingProject(supabase, { projectId, title, interviewDate, createdBy: user.id });
    if ("error" in created) return { ok: false, error: `Could not create the source: ${created.error}` };
    sourceId = created.sourceId;
  } else {
    const created = await createProjectWithSource(supabase, { title: campaign.title, description, interviewDate, createdBy: user.id });
    if ("error" in created) return { ok: false, error: `Could not create the Sourcework project: ${created.error}` };
    projectId = created.projectId;
    sourceId = created.sourceId;
    // The project is named for the season, so the one source in it needs the table's own name.
    await supabase.from("sw_sources").update({ title }).eq("id", sourceId);
    const { error } = await supabase.from("al_campaigns").update({ sourcework_project_id: projectId }).eq("id", campaign.id);
    if (error) console.error("Could not remember the campaign's Sourcework project:", error);
  }

  const contentType = "audio/mpeg";
  const destination = sourceObjectPath(sourceId, contentType);
  const { error: uploadError } = await supabase.storage.from(TRANSCRIPTION_MEDIA_BUCKET).upload(destination, audio, { contentType, upsert: true });
  if (uploadError) {
    await failSource(supabase, sourceId, `Could not copy the audio: ${uploadError.message}`);
    return { ok: false, error: `Could not copy the recording into Sourcework: ${uploadError.message}` };
  }

  const { error: updateError } = await supabase
    .from("sw_sources")
    .update({
      original_storage_path: destination,
      original_content_type: contentType,
      original_size_bytes: audio.length,
      original_duration_ms: conversation.duration_ms,
      status: "ready",
      error_message: null,
    })
    .eq("id", sourceId);
  if (updateError) {
    await failSource(supabase, sourceId, `Could not save the media details: ${updateError.message}`);
    return { ok: false, error: `Could not save the media details: ${updateError.message}` };
  }

  const ref = await getSourceRef(supabase, sourceId);
  const started = ref.representationId
    ? await startTranscriptionForProject(supabase, {
        representationId: ref.representationId,
        storagePath: destination,
        // The table's size narrows the diarizer's search, and what the voices said names them.
        speakerRange: speakerRangeFor(table.expected_speakers),
        identifySpeakers: true,
      })
    : { error: "This source has no transcript representation yet." };

  // The source holds the recording either way, so the link is kept even if the kickoff failed: Sourcework has its own retry.
  const { error: linkError } = await supabase
    .from("al_conversations")
    .update({
      sourcework_source_id: sourceId,
      transcription_project_id: projectId,
      ...(conversation.status === "complete" ? { status: "transcribing" as const } : {}),
    })
    .eq("id", conversationId);
  if (linkError) console.error("Could not record the Sourcework link on the conversation:", linkError);

  if (started.error) return { ok: false, error: started.error };
  return { ok: true, projectId, sourceId };
}
