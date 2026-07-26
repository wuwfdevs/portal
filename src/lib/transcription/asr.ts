import "server-only";
import type { TranscriptionProvider } from "@/lib/transcription/asr-provider";
import { assemblyAiProvider } from "@/lib/transcription/providers/assemblyai";

/** Single swap point for the ASR provider — see the TranscriptionProvider interface for why. */
export function getTranscriptionProvider(): TranscriptionProvider {
  return assemblyAiProvider;
}
