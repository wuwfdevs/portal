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
        // Highest-accuracy model, which is what interview transcription wants.
        // Use the singular `speech_model` field, not the `speech_models`
        // priority-list field: the former is typed as the `SpeechModel` union
        // ("best" | "nano" | "slam-1" | "universal"), so a bad identifier is a
        // compile error, while the latter is a bare `string[]` that accepts
        // anything and fails only at request time. A previous revision passed
        // invented ids ("universal-3-pro", "universal-2") through that hole and
        // every transcription request was rejected. Check the union in the
        // installed SDK before changing this value.
        speech_model: "best",
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
