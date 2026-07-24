// Pure parsing of AssemblyAI's transcript response shape into our
// provider-agnostic TranscriptionResult. Split out from assemblyai.ts (which
// does the actual fetch calls, hence "server-only") so this stays testable
// under Vitest without any network or environment setup.

import type { TranscribedUtterance, TranscriptionResult } from "../asr-provider";

// Subset of AssemblyAI's GET /v2/transcript/{id} response we rely on.
// start/end on utterances and words are milliseconds; audio_duration (not
// used here — Phase 1 already captures duration client-side at upload) is
// seconds. See https://www.assemblyai.com/docs for the full shape.
export interface AssemblyAiWord {
  text: string;
  start: number;
  end: number;
}

export interface AssemblyAiUtterance {
  speaker: string;
  start: number;
  end: number;
  text: string;
  words: AssemblyAiWord[];
}

export interface AssemblyAiTranscript {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  error?: string;
  utterances?: AssemblyAiUtterance[];
}

export function mapAssemblyAiTranscript(transcript: AssemblyAiTranscript): TranscriptionResult {
  const utterances: TranscribedUtterance[] = (transcript.utterances ?? []).map((u) => ({
    speakerLabel: u.speaker,
    startMs: u.start,
    endMs: u.end,
    text: u.text,
    words: u.words.map((w) => ({ w: w.text, s: w.start, e: w.end })),
  }));

  return { utterances };
}
