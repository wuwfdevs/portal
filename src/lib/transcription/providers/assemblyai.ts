import "server-only";
import { AssemblyAI } from "assemblyai";
import type {
  StartTranscriptionInput,
  TranscriptionProvider,
  TranscriptionResult,
} from "../asr-provider";
import { TranscriptionProviderError } from "../asr-provider";
import { mapAssemblyAiTranscript } from "./assemblyai-mapping";

const WEBHOOK_AUTH_HEADER_NAME = "x-transcription-webhook-secret";

function client(): AssemblyAI {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new TranscriptionProviderError("ASSEMBLYAI_API_KEY is not set");
  return new AssemblyAI({ apiKey });
}

/**
 * Thin adapter over AssemblyAI's async transcription API (speaker
 * diarization + word-level timestamps + webhooks, all native — see
 * docs/transcription-workspace-design.md §6 for why this provider), via the
 * official `assemblyai` SDK rather than hand-rolled fetch calls (see
 * CLAUDE.md's AssemblyAI note). Uses `transcripts.submit()`, not
 * `transcripts.transcribe()` — the latter polls until done, which would
 * block a Server Action for however long transcription takes; this pipeline
 * is webhook-driven, so submit-and-return-immediately is what we want.
 * Kept intentionally small: swapping providers later means writing a new
 * file behind the TranscriptionProvider interface, not touching the
 * pipeline.
 */
export const assemblyAiProvider: TranscriptionProvider = {
  async startTranscription(input: StartTranscriptionInput): Promise<string> {
    try {
      const transcript = await client().transcripts.submit({
        audio_url: input.mediaUrl,
        // Ordered model-availability fallback list — without this the API
        // silently applies its own default, which isn't necessarily the
        // current best model. universal-2 as the fallback covers all 99
        // languages if universal-3-pro isn't available for this account/audio.
        speech_models: ["universal-3-pro", "universal-2"],
        speaker_labels: true,
        webhook_url: input.webhookUrl,
        webhook_auth_header_name: WEBHOOK_AUTH_HEADER_NAME,
        webhook_auth_header_value: input.webhookSecret,
      });
      return transcript.id;
    } catch (error) {
      throw new TranscriptionProviderError(
        `AssemblyAI rejected the transcription request: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },

  async fetchResult(providerJobId: string): Promise<TranscriptionResult> {
    const transcript = await client().transcripts.get(providerJobId);

    if (transcript.status === "error") {
      throw new TranscriptionProviderError(transcript.error ?? "Transcription failed");
    }

    return mapAssemblyAiTranscript(transcript);
  },
};

export { WEBHOOK_AUTH_HEADER_NAME };
