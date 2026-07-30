// The local-master capture pipeline: lossless per-participant recording,
// durably buffered, uploaded in the background. Runs in both the host's
// studio and a guest's call view — see docs/remote-interview-design.md §6
// ("Local buffering, upload, and recovery") and the technical assessment's
// Phase 3 results, which validated this exact write-then-upload-then-delete
// sequence and chunked WAV assembly against a real prototype
// (prototype/remote-interview-poc/).
//
// Browser-only (uses getUserMedia, OPFS, Web Crypto) — never import this
// from server code. Not marked "server-only" because that guard is for the
// opposite mistake; there's no equivalent guard for "client-only", so this
// comment is it.
//
// This module durably buffers to OPFS and retries a failed upload with
// backoff for as long as the page stays open (nothing here is lost to a
// transient network blip). resumeIncompleteTracks below closes the other
// half of that story — "resume-on-reopen" (design doc §7, slice 4):
// reconstructing an in-flight track from a fresh page load after a crash or
// navigation away, by finding leftover OPFS directories and draining them
// with the same upload-with-retry contract live capture uses.
//
// Uses createWritable() rather than the prototype's createSyncAccessHandle()
// + dedicated Worker: sync access handles need a Worker context, and a
// worker script needs the `webworker` lib, which conflicts with this
// project's single tsconfig (`lib: ["dom", ...]`) — the prototype worked
// around that with a second tsconfig just for the worker. createWritable()
// is async but works from the main thread, keeping the durability contract
// (write fully before upload; delete only after the server acknowledges)
// without a second build target.

import { MediaRecorder as WavMediaRecorder, register } from "extendable-media-recorder";
import { connect } from "extendable-media-recorder-wav-encoder";
import { createClient } from "@/lib/supabase/client";
import { REMOTE_INTERVIEW_MEDIA_BUCKET } from "@/lib/remote-interview/media";

const TIMESLICE_MS = 5000;
const RETRY_BASE_DELAY_MS = 2000;
const RETRY_MAX_DELAY_MS = 30_000;
/** After this many failed attempts on the same part, report "interrupted" rather than staying silent — retries keep going regardless. */
const RETRY_NOTIFY_THRESHOLD = 3;

let registerPromise: Promise<void> | null = null;

/** extendable-media-recorder's register() throws if called twice; guard it module-wide. */
function ensureWavEncoderRegistered(): Promise<void> {
  if (!registerPromise) {
    registerPromise = connect().then((port) => register(port));
  }
  return registerPromise;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function partFileName(sequence: number): string {
  return `part-${String(sequence).padStart(6, "0")}.wav`;
}

async function trackDirHandle(trackId: string): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(`ri-track-${trackId}`, { create: true });
}

async function writeToOpfs(trackId: string, sequence: number, buffer: ArrayBuffer): Promise<void> {
  const dir = await trackDirHandle(trackId);
  const fileHandle = await dir.getFileHandle(partFileName(sequence), { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(buffer);
  await writable.close();
}

async function removeFromOpfs(trackId: string, sequence: number): Promise<void> {
  const dir = await trackDirHandle(trackId);
  await dir.removeEntry(partFileName(sequence)).catch(() => {});
}

/**
 * lib.dom.d.ts doesn't yet declare OPFS directory iteration, even with
 * "dom.iterable" — the runtime API (part of the File System spec) is ahead
 * of TypeScript's types here. This is the minimal shape resume-on-reopen
 * needs, applied via a cast at the two call sites below rather than
 * `@ts-expect-error`, so a real type error elsewhere in this function still
 * surfaces normally.
 */
interface IterableDirectoryHandle extends FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>;
}

const PART_FILE_PATTERN = /^part-(\d{6})\.wav$/;
/** OPFS directory names are "ri-track-<uuid>" (trackDirHandle above). */
const TRACK_DIR_PREFIX = "ri-track-";

/** Every trackId with a leftover OPFS directory in this browser profile. */
async function listBufferedTrackIds(): Promise<string[]> {
  const root = (await navigator.storage.getDirectory()) as IterableDirectoryHandle;
  const ids: string[] = [];
  for await (const [name] of root.entries()) {
    if (name.startsWith(TRACK_DIR_PREFIX)) ids.push(name.slice(TRACK_DIR_PREFIX.length));
  }
  return ids;
}

async function clearOpfsTrack(trackId: string): Promise<void> {
  const root = await navigator.storage.getDirectory();
  await root.removeEntry(`${TRACK_DIR_PREFIX}${trackId}`, { recursive: true }).catch(() => {});
}

export type PartOutcome =
  | { sequence: number; ok: true }
  | { sequence: number; ok: false; interrupted: boolean; message: string };

export interface LocalTrackRecorderOptions {
  /** The ri_tracks row id this recorder is writing parts for (source='local'). */
  trackId: string;
  /** This participant's remote-interview-media storage prefix (tokens.ts:storagePrefixFor). */
  storagePrefix: string;
  /** Date.now()-equivalent instant of ri_sessions.recording_started_at, for started_at_ms offsets. */
  sessionReferenceMs: number;
  onPartSettled?: (outcome: PartOutcome) => void;
  onPendingCountChange?: (pending: number) => void;
}

/**
 * Captures one participant's lossless local master for one recording run.
 * One instance per run — a stop/restart cycle gets a fresh instance with a
 * fresh trackId (design doc §5: run_index).
 */
export class LocalTrackRecorder {
  private recorder: InstanceType<typeof WavMediaRecorder> | null = null;
  private stream: MediaStream | null = null;
  private sequence = 0;
  private pending = new Set<number>();
  private stopped: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(private readonly options: LocalTrackRecorderOptions) {}

  /** The capture stream, for a UI-side level meter — AEC/NS/AGC are off here (design doc §6), unlike the call stream. */
  getStream(): MediaStream | null {
    return this.stream;
  }

  getPendingCount(): number {
    return this.pending.size;
  }

  async start(): Promise<void> {
    await ensureWavEncoderRegistered();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.stream = stream;

    const recorder = new WavMediaRecorder(stream, { mimeType: "audio/wav" });
    this.recorder = recorder;

    recorder.addEventListener("dataavailable", (event) => {
      const blob = (event as unknown as { data: Blob }).data;
      const sequence = this.sequence++;
      const startedAtMs = Math.max(0, Math.round(Date.now() - this.options.sessionReferenceMs));
      void blob.arrayBuffer().then((buffer) => this.handlePart(sequence, buffer, startedAtMs));
    });

    this.stopped = new Promise((resolve) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
    });

    recorder.start(TIMESLICE_MS);
  }

  /** Stops recording and returns the total part count this run produced (ri_tracks.expected_part_count). */
  async stop(): Promise<number> {
    if (!this.recorder) return this.sequence;
    this.recorder.stop();
    await this.stopped;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    return this.sequence;
  }

  /** Tears down retry loops entirely — only call when leaving the page, not on a plain recording stop (uploads must keep draining after stop). */
  dispose(): void {
    this.disposed = true;
  }

  private setPending(sequence: number, isPending: boolean): void {
    if (isPending) this.pending.add(sequence);
    else this.pending.delete(sequence);
    this.options.onPendingCountChange?.(this.pending.size);
  }

  private async handlePart(
    sequence: number,
    buffer: ArrayBuffer,
    startedAtMs: number,
  ): Promise<void> {
    this.setPending(sequence, true);
    try {
      await writeToOpfs(this.options.trackId, sequence, buffer);
    } catch (err) {
      // Nothing durable exists for this chunk to retry from — a genuine
      // capture-loss event (e.g. storage quota), not a transient one.
      this.setPending(sequence, false);
      this.options.onPartSettled?.({
        sequence,
        ok: false,
        interrupted: true,
        message: `Could not buffer this part locally: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
    await this.uploadWithRetry(sequence, buffer, startedAtMs, 0);
  }

  private async uploadWithRetry(
    sequence: number,
    buffer: ArrayBuffer,
    startedAtMs: number,
    attempt: number,
  ): Promise<void> {
    return uploadPartWithRetry(
      {
        trackId: this.options.trackId,
        storagePrefix: this.options.storagePrefix,
        sequence,
        buffer,
        startedAtMs,
        isDisposed: () => this.disposed,
        onSettled: (outcome) => {
          if (outcome.ok) this.setPending(sequence, false);
          this.options.onPartSettled?.(outcome);
        },
      },
      attempt,
    );
  }
}

interface UploadPartParams {
  trackId: string;
  storagePrefix: string;
  sequence: number;
  buffer: ArrayBuffer;
  startedAtMs: number;
  isDisposed: () => boolean;
  onSettled?: (outcome: PartOutcome) => void;
}

/**
 * Uploads one part with retry/backoff, deleting the local OPFS copy only
 * once the server has acknowledged it (design doc §6, step 4). Shared by
 * LocalTrackRecorder's live capture path and resumeIncompleteTracks' drain
 * path below — both need the identical retry contract, just triggered from
 * different places (a fresh `dataavailable` event vs. a leftover OPFS file
 * found on reopen).
 */
async function uploadPartWithRetry(params: UploadPartParams, attempt: number): Promise<void> {
  const { trackId, storagePrefix, sequence, buffer, startedAtMs, isDisposed, onSettled } = params;
  try {
    const checksum = await sha256Hex(buffer);
    const storagePath = `${storagePrefix}/local-${partFileName(sequence)}`;
    const supabase = createClient();

    const { error: uploadError } = await supabase.storage
      .from(REMOTE_INTERVIEW_MEDIA_BUCKET)
      .upload(storagePath, buffer, { contentType: "audio/wav", upsert: true });
    if (uploadError) throw uploadError;

    const { error: partError } = await supabase.from("ri_track_parts").insert({
      track_id: trackId,
      sequence,
      storage_path: storagePath,
      size_bytes: buffer.byteLength,
      checksum,
      started_at_ms: startedAtMs,
    });
    // unique(track_id, sequence) makes a retried duplicate an expected,
    // idempotent no-op (design doc §5) — not a real failure.
    if (partError && partError.code !== "23505") throw partError;

    await removeFromOpfs(trackId, sequence);
    onSettled?.({ sequence, ok: true });
  } catch (err) {
    if (isDisposed()) return;

    if (attempt >= RETRY_NOTIFY_THRESHOLD) {
      onSettled?.({
        sequence,
        ok: false,
        interrupted: true,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    const delay = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (isDisposed()) return;
    return uploadPartWithRetry(params, attempt + 1);
  }
}

export interface ResumeReport {
  trackId: string;
  partsDrained: number;
}

/**
 * Design doc §7 slice 4, "resume-on-reopen": finds any OPFS directories left
 * over in this browser from a crash, refresh, or closed tab, verifies each
 * belongs to `participantId` and isn't already a finished track, and drains
 * whatever wasn't acknowledged before the interruption using the same
 * upload-with-retry contract live capture uses. Called once on mount,
 * before any new recording run starts (use-local-capture.ts) — not tied to
 * a live MediaRecorder, since the whole point is there may not be one yet.
 *
 * A track still `recording` (the run never got an explicit stop — the
 * crash happened mid-recording) is left with `expected_part_count` still
 * null after draining: there is no way to know from here whether every
 * part that was ever produced made it to OPFS before the crash, so this
 * intentionally does not claim completeness. assembly.ts treats a null
 * expected_part_count as "can't confirm," landing on `partial` rather than
 * `complete` — provenance stays honest per design doc §6.
 */
export async function resumeIncompleteTracks(
  participantId: string,
  storagePrefix: string,
  onPartSettled?: (outcome: PartOutcome) => void,
): Promise<ResumeReport[]> {
  const trackIds = await listBufferedTrackIds();
  if (trackIds.length === 0) return [];

  const supabase = createClient();
  const reports: ResumeReport[] = [];

  for (const trackId of trackIds) {
    const { data: track, error: trackError } = await supabase
      .from("ri_tracks")
      .select("id, participant_id, status")
      .eq("id", trackId)
      .maybeSingle();
    if (trackError || !track || track.participant_id !== participantId) {
      // Not ours (or the row is gone) — leave the directory alone rather
      // than guess; nothing here can safely delete data it can't attribute.
      continue;
    }

    if (track.status === "complete") {
      // assembly.ts already consumed every part it needed; any leftover
      // OPFS files here are stale copies already acknowledged pre-crash.
      await clearOpfsTrack(trackId);
      continue;
    }

    const { data: existingParts } = await supabase
      .from("ri_track_parts")
      .select("sequence")
      .eq("track_id", trackId);
    const alreadyUploaded = new Set((existingParts ?? []).map((p) => p.sequence));

    const dir = (await trackDirHandle(trackId)) as IterableDirectoryHandle;
    let partsDrained = 0;
    for await (const [name, handle] of dir.entries()) {
      const match = PART_FILE_PATTERN.exec(name);
      if (!match || handle.kind !== "file") continue;
      const sequence = Number(match[1]);
      if (alreadyUploaded.has(sequence)) {
        await removeFromOpfs(trackId, sequence);
        continue;
      }

      const file = await (handle as FileSystemFileHandle).getFile();
      const buffer = await file.arrayBuffer();
      // The original wall-clock offset wasn't durably recorded for a part
      // that never reached the server — approximate it from the fixed
      // capture timeslice (TIMESLICE_MS) rather than leave it undefined.
      // Advisory, same as duration_ms elsewhere in this schema. Fired
      // without awaiting, same as live capture's own dataavailable handler:
      // a stuck retry (network down) must not block draining the rest of
      // this track's leftover files.
      void uploadPartWithRetry(
        {
          trackId,
          storagePrefix,
          sequence,
          buffer,
          startedAtMs: sequence * TIMESLICE_MS,
          isDisposed: () => false,
          onSettled: onPartSettled,
        },
        0,
      );
      partsDrained += 1;
    }

    if (partsDrained > 0) {
      reports.push({ trackId, partsDrained });
      if (track.status === "recording") {
        await supabase.from("ri_tracks").update({ status: "uploading" }).eq("id", trackId);
      }
      const { data: participant } = await supabase
        .from("ri_participants")
        .select("session_id")
        .eq("id", participantId)
        .maybeSingle();
      if (participant) {
        await supabase.from("ri_session_events").insert({
          session_id: participant.session_id,
          participant_id: participantId,
          kind: "local_track_resumed",
          detail: { track_id: trackId, parts_drained: partsDrained },
        });
      }
    }
  }

  return reports;
}
