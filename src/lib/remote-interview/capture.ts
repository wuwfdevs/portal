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
// One deliberate scope boundary, matching the phase 4 slice split in
// CLAUDE.md: this module durably buffers to OPFS and retries a failed
// upload with backoff for as long as the page stays open (nothing here is
// lost to a transient network blip), but it does NOT reconstruct an
// in-flight track from a fresh page load after a crash or navigation away —
// that's "resume-on-reopen", explicitly slice 4's job
// (docs/remote-interview-design.md §7). The underlying OPFS write/delete
// primitives here are the same ones a resume feature would reuse; only the
// "find my incomplete track and drain it" trigger is missing.
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

export const REMOTE_INTERVIEW_MEDIA_BUCKET = "remote-interview-media";

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
    try {
      const checksum = await sha256Hex(buffer);
      const storagePath = `${this.options.storagePrefix}/local-${partFileName(sequence)}`;
      const supabase = createClient();

      const { error: uploadError } = await supabase.storage
        .from(REMOTE_INTERVIEW_MEDIA_BUCKET)
        .upload(storagePath, buffer, { contentType: "audio/wav", upsert: true });
      if (uploadError) throw uploadError;

      const { error: partError } = await supabase.from("ri_track_parts").insert({
        track_id: this.options.trackId,
        sequence,
        storage_path: storagePath,
        size_bytes: buffer.byteLength,
        checksum,
        started_at_ms: startedAtMs,
      });
      // unique(track_id, sequence) makes a retried duplicate an expected,
      // idempotent no-op (design doc §5) — not a real failure.
      if (partError && partError.code !== "23505") throw partError;

      await removeFromOpfs(this.options.trackId, sequence);
      this.setPending(sequence, false);
      this.options.onPartSettled?.({ sequence, ok: true });
    } catch (err) {
      if (this.disposed) return;

      if (attempt >= RETRY_NOTIFY_THRESHOLD) {
        this.options.onPartSettled?.({
          sequence,
          ok: false,
          interrupted: true,
          message: err instanceof Error ? err.message : String(err),
        });
      }

      const delay = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (this.disposed) return;
      return this.uploadWithRetry(sequence, buffer, startedAtMs, attempt + 1);
    }
  }
}
