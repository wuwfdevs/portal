import "server-only";
import type {
  StartTranscriptionInput,
  TranscriptionProvider,
  TranscriptionResult,
} from "../asr-provider";
import { TranscriptionProviderError } from "../asr-provider";
import { mapAssemblyAiTranscript, type AssemblyAiTranscript } from "./assemblyai-mapping";

const API_BASE = "https://api.assemblyai.com/v2";
const WEBHOOK_AUTH_HEADER_NAME = "x-transcription-webhook-secret";

function apiKey(): string {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) throw new TranscriptionProviderError("ASSEMBLYAI_API_KEY is not set");
  return key;
}

/**
 * Thin adapter over AssemblyAI's async transcription API (speaker
 * diarization + word-level timestamps + webhooks, all native — see
 * docs/transcription-workspace-design.md §6 for why this provider). Kept
 * intentionally small: swapping providers later means writing a new file
 * behind the TranscriptionProvider interface, not touching the pipeline.
 */
export const assemblyAiProvider: TranscriptionProvider = {
  async startTranscription(input: StartTranscriptionInput): Promise<string> {
    const response = await fetch(`${API_BASE}/transcript`, {
      method: "POST",
      headers: {
        Authorization: apiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_url: input.mediaUrl,
        speaker_labels: true,
        webhook_url: input.webhookUrl,
        webhook_auth_header_name: WEBHOOK_AUTH_HEADER_NAME,
        webhook_auth_header_value: input.webhookSecret,
      }),
    });

    if (!response.ok) {
      throw new TranscriptionProviderError(
        `AssemblyAI rejected the transcription request (${response.status})`,
      );
    }

    const data = (await response.json()) as { id: string };
    return data.id;
  },

  async fetchResult(providerJobId: string): Promise<TranscriptionResult> {
    const response = await fetch(`${API_BASE}/transcript/${providerJobId}`, {
      headers: { Authorization: apiKey() },
    });

    if (!response.ok) {
      throw new TranscriptionProviderError(
        `Could not fetch transcript ${providerJobId} (${response.status})`,
      );
    }

    const transcript = (await response.json()) as AssemblyAiTranscript;
    if (transcript.status === "error") {
      throw new TranscriptionProviderError(transcript.error ?? "Transcription failed");
    }

    return mapAssemblyAiTranscript(transcript);
  },
};

export { WEBHOOK_AUTH_HEADER_NAME };
