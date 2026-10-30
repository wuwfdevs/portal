import path from "node:path";
import fs from "node:fs/promises";

const DATA_ROOT = path.resolve(import.meta.dirname, "..", "..", "data");

export function trackDir(trackId: string): string {
  return path.join(DATA_ROOT, trackId);
}

export function partsDir(trackId: string): string {
  return path.join(trackDir(trackId), "parts");
}

export function partPath(trackId: string, sequence: number): string {
  return path.join(partsDir(trackId), `part-${String(sequence).padStart(6, "0")}.wav`);
}

export function masterPath(trackId: string): string {
  return path.join(trackDir(trackId), "master.wav");
}

export async function ensurePartsDir(trackId: string): Promise<void> {
  await fs.mkdir(partsDir(trackId), { recursive: true });
}

/** Lists existing part sequence numbers for a track, in ascending order. */
export async function listPartSequences(trackId: string): Promise<number[]> {
  await ensurePartsDir(trackId);
  const entries = await fs.readdir(partsDir(trackId));
  return entries
    .map((name) => /^part-(\d+)\.wav$/.exec(name))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}
