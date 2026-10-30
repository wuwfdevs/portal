import { MediaRecorder, register } from "extendable-media-recorder";
import { connect } from "extendable-media-recorder-wav-encoder";
import type { MainToWorkerMessage, WorkerToMainMessage } from "./types.ts";

const statusEl = document.querySelector<HTMLSpanElement>("#status")!;
const logEl = document.querySelector<HTMLPreElement>("#log")!;
const LAST_TRACK_KEY = "poc:last-track-id";

function log(line: string): void {
  console.log(line);
  logEl.textContent += line + "\n";
}

function setStatus(status: string): void {
  statusEl.textContent = status;
}

// ---------------------------------------------------------------------------
// Task 3: canary — confirm the WAV encoder registers and is supported here.
// ---------------------------------------------------------------------------

async function runCanary(): Promise<{ ok: boolean; detail: string }> {
  try {
    await register(await connect());
    const supported = MediaRecorder.isTypeSupported("audio/wav");
    if (!supported) {
      return { ok: false, detail: "isTypeSupported('audio/wav') returned false after register()" };
    }
    return { ok: true, detail: "registered and isTypeSupported('audio/wav') === true" };
  } catch (err) {
    return { ok: false, detail: `threw: ${err instanceof Error ? err.stack : String(err)}` };
  }
}

// ---------------------------------------------------------------------------
// Task 4: diagnostic chunk dump — recorder only, no OPFS/upload wiring.
// ---------------------------------------------------------------------------

interface ChunkInfo {
  sequence: number;
  byteLength: number;
  firstBytesHex: string;
}

async function runChunkDump(durationMs: number): Promise<ChunkInfo[]> {
  await register(await connect());

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
  });
  const track = stream.getAudioTracks()[0];
  log(`getUserMedia settings: ${JSON.stringify(track.getSettings())}`);

  const recorder = new MediaRecorder(stream, { mimeType: "audio/wav" });
  const chunks: ChunkInfo[] = [];
  let sequence = 0;

  recorder.addEventListener("dataavailable", (event) => {
    void event.data.arrayBuffer().then((buffer) => {
      const bytes = new Uint8Array(buffer).subarray(0, 16);
      const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");
      chunks.push({ sequence: sequence++, byteLength: buffer.byteLength, firstBytesHex: hex });
      log(`chunk ${chunks.length - 1}: ${buffer.byteLength} bytes, first 16: ${hex}`);
    });
  });

  const stopped = new Promise<void>((resolve) => {
    recorder.addEventListener("stop", () => resolve(), { once: true });
  });

  recorder.start(5000);
  setStatus("recording");
  await new Promise((resolve) => setTimeout(resolve, durationMs));
  recorder.stop();
  await stopped;
  await new Promise((resolve) => setTimeout(resolve, 100));
  setStatus("stopped");

  track.stop();
  return chunks;
}

// ---------------------------------------------------------------------------
// Tasks 5-7: full capture, wired to the OPFS worker for durable buffering
// and chunked upload, plus the reload/resume path.
// ---------------------------------------------------------------------------

let worker: Worker | null = null;
const workerEvents: WorkerToMainMessage[] = [];

function ensureWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./opfs-worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", (event: MessageEvent<WorkerToMainMessage>) => {
      workerEvents.push(event.data);
      log(`[worker] ${JSON.stringify(event.data)}`);
    });
  }
  return worker;
}

// Boot-time resume: if a previous capture left a trackId behind (simulating
// "reopen the link on the same device"), immediately ask the worker to drain
// whatever it finds still sitting in OPFS for that track. This runs on every
// page load/reload, exactly matching how a real reload would be handled —
// there is no separate "resume" feature, just this same boot check.
const resumedTrackId = localStorage.getItem(LAST_TRACK_KEY);
if (resumedTrackId) {
  log(`boot: found previous track ${resumedTrackId} in localStorage — requesting resume`);
  const msg: MainToWorkerMessage = { type: "resume", trackId: resumedTrackId };
  ensureWorker().postMessage(msg);
}

interface ActiveCapture {
  trackId: string;
  recorder: InstanceType<typeof MediaRecorder>;
  track: MediaStreamTrack;
  sequence: number;
  startPerfMs: number;
  stopped: Promise<void>;
}

let active: ActiveCapture | null = null;

async function startCapture(trackId: string): Promise<void> {
  await register(await connect());
  localStorage.setItem(LAST_TRACK_KEY, trackId);

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const track = stream.getAudioTracks()[0];
  const recorder = new MediaRecorder(stream, { mimeType: "audio/wav" });
  const w = ensureWorker();

  const state: ActiveCapture = {
    trackId,
    recorder,
    track,
    sequence: 0,
    startPerfMs: performance.now(),
    stopped: Promise.resolve(),
  };

  recorder.addEventListener("dataavailable", (event) => {
    const seq = state.sequence++;
    void event.data.arrayBuffer().then((buffer) => {
      const msg: MainToWorkerMessage = { type: "chunk", trackId, sequence: seq, buffer };
      w.postMessage(msg, [buffer]);
    });
  });

  state.stopped = new Promise<void>((resolve) => {
    recorder.addEventListener("stop", () => resolve(), { once: true });
  });

  recorder.start(5000);
  setStatus("recording");
  active = state;
}

/** Returns elapsed recording duration in ms, measured client-side. */
async function stopCapture(): Promise<{ elapsedMs: number; chunkCount: number }> {
  if (!active) throw new Error("stopCapture: no active capture");
  const { recorder, track, startPerfMs, stopped } = active;
  recorder.stop();
  await stopped;
  // Measure elapsed recording time right as the recorder actually stops —
  // not after the grace period below, which waits for the final chunk's
  // arrayBuffer() conversion to land but has nothing to do with how much
  // audio was recorded, and would otherwise pad this measurement.
  const elapsedMs = performance.now() - startPerfMs;
  await new Promise((resolve) => setTimeout(resolve, 200));
  const chunkCount = active.sequence;
  track.stop();
  setStatus("stopped");
  active = null;
  return { elapsedMs, chunkCount };
}

/** Lists whatever's currently in a track's OPFS directory, from the main thread. */
async function listOpfsFiles(trackId: string): Promise<string[]> {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(`track-${trackId}`, { create: true });
  const names: string[] = [];
  for await (const [name] of dir.entries()) names.push(name);
  return names.sort();
}

function getWorkerEvents(): WorkerToMainMessage[] {
  return [...workerEvents];
}

function ackedCount(trackId: string): number {
  return workerEvents.filter((e) => e.type === "ack" && e.trackId === trackId).length;
}

function clearLastTrack(): void {
  localStorage.removeItem(LAST_TRACK_KEY);
}

declare global {
  interface Window {
    __poc: {
      runCanary: typeof runCanary;
      runChunkDump: typeof runChunkDump;
      startCapture: typeof startCapture;
      stopCapture: typeof stopCapture;
      listOpfsFiles: typeof listOpfsFiles;
      getWorkerEvents: typeof getWorkerEvents;
      ackedCount: typeof ackedCount;
      clearLastTrack: typeof clearLastTrack;
    };
  }
}

window.__poc = {
  runCanary,
  runChunkDump,
  startCapture,
  stopCapture,
  listOpfsFiles,
  getWorkerEvents,
  ackedCount,
  clearLastTrack,
};

setStatus("loaded");
log("main.ts loaded");
