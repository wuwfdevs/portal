// Pure parsing of AssemblyAI's Transcript shape into our provider-agnostic
// TranscriptionResult. Split out from assemblyai.ts (which does the actual
// SDK calls, hence "server-only") so this stays testable under Vitest
// without any network or environment setup.
//
// Uses the `assemblyai` package's own real types (Transcript,
// TranscriptUtterance) rather than a hand-guessed shape — start/end on
// utterances and words are milliseconds, confirmed against the SDK's
// shipped type definitions.

import type { Transcript } from "assemblyai";
import type { TranscribedUtterance, TranscriptionResult } from "../asr-provider";

export function mapAssemblyAiTranscript(
  transcript: Pick<Transcript, "utterances">,
): TranscriptionResult {
  const utterances: TranscribedUtterance[] = (transcript.utterances ?? []).map((u) => ({
    speakerLabel: u.speaker,
    startMs: u.start,
    endMs: u.end,
    text: u.text,
    words: u.words.map((w) => ({ w: w.text, s: w.start, e: w.end })),
  }));

  return { utterances };
}
