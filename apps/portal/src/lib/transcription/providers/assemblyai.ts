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
        // Priority-ordered model list. The singular `speech_model` field looks
        // safer — it's typed as the SpeechModel union, so a bad id is a compile
        // error — but the live API rejects it outright:
        //
        //   "The speech_model parameter is deprecated. Use speech_models:
        //    ["universal-3-5-pro", "universal-2"] for the best accuracy,
        //    performance, and language coverage."
        //
        // The installed SDK (4.36.4, current latest) does not reflect that: its
        // generated types still list speech_model undeprecated and enumerate
        // only "best" | "nano" | "slam-1" | "universal". The spec lags the API,
        // which is why `speech_models` is typed as a bare `string[]` — it
        // deliberately accepts ids the enum doesn't know about.
        //
        // So these ids are NOT compile-checked and NOT verifiable from the SDK.
        // They came from the API's own deprecation notice. Don't "correct" them
        // against the SDK union or from memory — an earlier revision guessed
        // "universal-3-pro" here and every request failed. Verify against the
        // assemblyai-docs MCP server (see CLAUDE.md) before changing them.
        speech_models: ["universal-3-5-pro", "universal-2"],
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
