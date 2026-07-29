/// <reference lib="webworker" />
import type { MainToWorkerMessage, WorkerToMainMessage } from "./types.ts";

declare const self: DedicatedWorkerGlobalScope;

function post(msg: WorkerToMainMessage): void {
  self.postMessage(msg);
}

function partFileName(sequence: number): string {
  return `part-${String(sequence).padStart(6, "0")}.wav`;
}

async function trackDirHandle(trackId: string): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(`track-${trackId}`, { create: true });
}

/**
 * The durability sequence, in full: write the chunk to OPFS and flush/close
 * BEFORE attempting upload; only delete the OPFS copy once the server has
 * acknowledged it with a 2xx. On any failure, do nothing further — the file
 * stays in OPFS for the next drain attempt (either a retry here, or the
 * resume-on-load path, which reuses this exact same upload-then-delete step
 * rather than a separate implementation).
 */
async function writeAndUpload(trackId: string, sequence: number, buffer: ArrayBuffer): Promise<void> {
  const dir = await trackDirHandle(trackId);
  const fileHandle = await dir.getFileHandle(partFileName(sequence), { create: true });

  // Step 1: durably write to OPFS first. Nothing leaves local storage until
  // this completes AND the server acknowledges it (step 2/3 below).
  const accessHandle = await fileHandle.createSyncAccessHandle();
  accessHandle.write(new Uint8Array(buffer), { at: 0 });
  accessHandle.flush();
  accessHandle.close();

  await uploadAndMaybeDelete(dir, trackId, sequence, buffer);
}

async function uploadAndMaybeDelete(
  dir: FileSystemDirectoryHandle,
  trackId: string,
  sequence: number,
  buffer: ArrayBuffer,
): Promise<void> {
  try {
    const res = await fetch(`/api/tracks/${trackId}/parts/${sequence}`, {
      method: "PUT",
      body: buffer,
    });
    if (res.ok) {
      // Step 3: only delete locally after the server has acknowledged.
      await dir.removeEntry(partFileName(sequence));
      post({ type: "ack", trackId, sequence });
    } else {
      post({ type: "error", trackId, sequence, message: `upload responded ${res.status}` });
    }
  } catch (err) {
    // Network error, tab about to unload, etc. — leave the file in OPFS;
    // the next resume/drain pass will retry it.
    post({ type: "error", trackId, sequence, message: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Resume-on-load: list whatever's still in the track's OPFS directory (i.e.
 * everything that was written but never successfully acked) and re-run the
 * identical upload-then-delete step on each. Not a parallel implementation —
 * literally the same function as the live-upload path, invoked at a
 * different time, so there's no way for resume logic to silently diverge
 * from the live path.
 */
async function resumeTrack(trackId: string): Promise<void> {
  const dir = await trackDirHandle(trackId);
  const found: { sequence: number; buffer: ArrayBuffer }[] = [];

  for await (const [name, handle] of dir.entries()) {
    const match = /^part-(\d+)\.wav$/.exec(name);
    if (!match || handle.kind !== "file") continue;
    const fileHandle = handle as FileSystemFileHandle;
    const accessHandle = await fileHandle.createSyncAccessHandle();
    const size = accessHandle.getSize();
    const buffer = new ArrayBuffer(size);
    accessHandle.read(new Uint8Array(buffer), { at: 0 });
    accessHandle.close();
    found.push({ sequence: Number(match[1]), buffer });
  }

  post({ type: "resume-found", trackId, count: found.length });

  for (const { sequence, buffer } of found.sort((a, b) => a.sequence - b.sequence)) {
    await uploadAndMaybeDelete(dir, trackId, sequence, buffer);
  }
}

self.addEventListener("message", (event: MessageEvent<MainToWorkerMessage>) => {
  const msg = event.data;
  if (msg.type === "chunk") {
    void writeAndUpload(msg.trackId, msg.sequence, msg.buffer);
  } else if (msg.type === "resume") {
    void resumeTrack(msg.trackId);
  }
});
