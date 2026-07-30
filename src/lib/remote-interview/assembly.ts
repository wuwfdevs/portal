import "server-only";

// Local-master assembly (design doc §6, "Assembly and verification" and §7
// slice 4): concatenates a track's uploaded parts in sequence order,
// rewrites the WAV header (parts carry stale RIFF lengths, exactly as
// concatenated WebM parts carry no duration), verifies the result is
// readable, and records size/duration/checksum on the track row. Follows
// the existing clip-export precedent (lib/transcription/export.ts):
// ffmpeg-static, invoked as a route handler or Server Action with
// runtime="nodejs" and a generous maxDuration, no job queue (design doc's
// architecture table: "one async step per session").
//
// Downloads each part locally rather than feeding ffmpeg the storage URLs
// directly — parts already went through Supabase Storage once on upload, so
// this is a second read, but it keeps ffmpeg's concat demuxer on plain local
// paths instead of juggling protocol whitelisting for potentially hundreds
// of short-lived signed URLs.
//
// Cloud-backup tracks are NOT assembled here — Daily writes those directly
// to the customer S3 destination, and this repo has no webhook confirming
// that delivery landed (see studio/actions.ts's stopStudioRecording comment
// and the design doc's still-open "raw-tracks S3-destination question").
// Only local tracks have parts in ri_track_parts for this module to work
// with.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@/lib/supabase/server";
import { REMOTE_INTERVIEW_MEDIA_BUCKET, assembledTrackObjectPath } from "@/lib/remote-interview/media";
import { isReadableWav, wavDurationMs } from "@/lib/remote-interview/wav";
import type { Database } from "@/lib/database.types";

export type AssemblyResult = { ok: true } | { ok: false; message: string };

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type RiTrackUpdate = Database["public"]["Tables"]["ri_tracks"]["Update"];

async function markTrack(
  supabase: SupabaseClient,
  trackId: string,
  patch: RiTrackUpdate,
): Promise<void> {
  const { error } = await supabase.from("ri_tracks").update(patch).eq("id", trackId);
  if (error) console.error(`Could not update track ${trackId} after assembly:`, error);
}

async function logSessionEvent(
  supabase: SupabaseClient,
  sessionId: string,
  participantId: string,
  kind: string,
  detail: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from("ri_session_events")
    .insert({ session_id: sessionId, participant_id: participantId, kind, detail });
  if (error) console.error(`Could not log ${kind} event for session ${sessionId}:`, error);
}

function runFfmpegConcat(ffmpegBinary: string, listPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegBinary, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-ar",
      "48000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      "-y",
      outputPath,
    ]);

    const stderrChunks: Buffer[] = [];
    ffmpeg.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        const message = Buffer.concat(stderrChunks).toString("utf-8").trim().slice(0, 500);
        reject(new Error(`ffmpeg exited with code ${code}${message ? `: ${message}` : ""}`));
      }
    });
  });
}

/**
 * Assembles a local track from its uploaded parts. Idempotent-ish: safe to
 * call again on a track already `complete` (short-circuits) or `partial`/
 * `failed` (design doc §3F: "The host can retry a failed assembly").
 * Returns a plain ok/message result rather than throwing — assemble callers
 * (Server Actions, the resume/finish flow) always want a message to show,
 * never an unhandled exception.
 */
export async function assembleLocalTrack(trackId: string): Promise<AssemblyResult> {
  const supabase = await createClient();

  const { data: track, error: trackError } = await supabase
    .from("ri_tracks")
    .select("id, participant_id, source, status, expected_part_count, run_index")
    .eq("id", trackId)
    .maybeSingle();
  if (trackError) return { ok: false, message: trackError.message };
  if (!track) return { ok: false, message: "That track no longer exists." };
  if (track.source !== "local") {
    return { ok: false, message: "Only local masters can be assembled here." };
  }
  if (track.status === "complete") return { ok: true };

  const { data: participant, error: participantError } = await supabase
    .from("ri_participants")
    .select("id, session_id, storage_prefix, display_name")
    .eq("id", track.participant_id)
    .maybeSingle();
  if (participantError) return { ok: false, message: participantError.message };
  if (!participant) return { ok: false, message: "This track's participant no longer exists." };

  const { data: parts, error: partsError } = await supabase
    .from("ri_track_parts")
    .select("sequence, storage_path")
    .eq("track_id", trackId)
    .order("sequence", { ascending: true });
  if (partsError) return { ok: false, message: partsError.message };

  if (!parts || parts.length === 0) {
    await markTrack(supabase, trackId, {
      status: "missing",
      error_message: "No parts were ever uploaded for this track.",
    });
    return { ok: false, message: "No parts were ever uploaded for this track." };
  }

  if (track.expected_part_count != null && parts.length < track.expected_part_count) {
    const missing = track.expected_part_count - parts.length;
    return {
      ok: false,
      message: `Still waiting on ${missing} part${missing === 1 ? "" : "s"} to upload. Try again once upload catches up.`,
    };
  }

  if (!ffmpegPath) {
    return { ok: false, message: "ffmpeg binary is not available in this environment." };
  }
  const ffmpegBinary: string = ffmpegPath;

  const isKnownComplete = track.expected_part_count != null && parts.length === track.expected_part_count;
  await markTrack(supabase, trackId, { status: "assembling" });

  const workDir = await mkdtemp(join(tmpdir(), "ri-assembly-"));
  try {
    const listLines: string[] = [];
    for (const part of parts) {
      const { data, error } = await supabase.storage
        .from(REMOTE_INTERVIEW_MEDIA_BUCKET)
        .download(part.storage_path);
      if (error || !data) {
        const message = `Part ${part.sequence} could not be read from storage: ${error?.message ?? "missing object"}.`;
        await markTrack(supabase, trackId, { status: "partial", error_message: message });
        await logSessionEvent(supabase, participant.session_id, participant.id, "assembly_failed", {
          track_id: trackId,
          message,
        });
        return { ok: false, message };
      }
      const localPath = join(workDir, `part-${String(part.sequence).padStart(6, "0")}.wav`);
      await writeFile(localPath, Buffer.from(await data.arrayBuffer()));
      // ffmpeg's concat demuxer list format; single quotes are escaped per its own syntax.
      listLines.push(`file '${localPath.replace(/'/g, "'\\''")}'`);
    }

    const listPath = join(workDir, "parts.txt");
    await writeFile(listPath, listLines.join("\n"));
    const outputPath = join(workDir, "assembled.wav");

    await runFfmpegConcat(ffmpegBinary, listPath, outputPath);
    const assembled = await readFile(outputPath);

    if (!isReadableWav(assembled)) {
      const message = "Assembly produced a file that failed the WAV readability check.";
      await markTrack(supabase, trackId, { status: "failed", error_message: message });
      await logSessionEvent(supabase, participant.session_id, participant.id, "assembly_failed", {
        track_id: trackId,
        message,
      });
      return { ok: false, message };
    }

    const checksum = createHash("sha256").update(assembled).digest("hex");
    const durationMs = wavDurationMs(assembled);
    const storagePath = assembledTrackObjectPath(participant.storage_prefix, track.run_index);

    const { error: uploadError } = await supabase.storage
      .from(REMOTE_INTERVIEW_MEDIA_BUCKET)
      .upload(storagePath, assembled, { contentType: "audio/wav", upsert: true });
    if (uploadError) {
      await markTrack(supabase, trackId, { status: "failed", error_message: uploadError.message });
      await logSessionEvent(supabase, participant.session_id, participant.id, "assembly_failed", {
        track_id: trackId,
        message: uploadError.message,
      });
      return { ok: false, message: uploadError.message };
    }

    const now = new Date().toISOString();
    const finalStatus = isKnownComplete ? "complete" : "partial";
    await markTrack(supabase, trackId, {
      status: finalStatus,
      storage_path: storagePath,
      size_bytes: assembled.byteLength,
      duration_ms: durationMs,
      sample_rate: 48000,
      checksum,
      verified_at: now,
      assembled_at: now,
      error_message: isKnownComplete
        ? null
        : "Assembled from the parts that arrived; the expected part count could not be confirmed.",
    });
    await logSessionEvent(supabase, participant.session_id, participant.id, "assembly_completed", {
      track_id: trackId,
      part_count: parts.length,
      status: finalStatus,
    });

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markTrack(supabase, trackId, { status: "failed", error_message: message });
    await logSessionEvent(supabase, participant.session_id, participant.id, "assembly_failed", {
      track_id: trackId,
      message,
    });
    return { ok: false, message };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
