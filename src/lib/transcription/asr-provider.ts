// Provider-agnostic shape the transcription pipeline (kickoff + webhook
// handler) works with. Pure types only — no "server-only", no fetch — so the
// concrete provider implementation (providers/<name>.ts) stays a swappable,
// contained piece behind this interface. See
// docs/transcription-workspace-design.md §6 on why: switching ASR vendors
// later should mean writing a new file here, not touching the pipeline.

export interface TranscribedWord {
  w: string;
  s: number; // start_ms
  e: number; // end_ms
}

export interface TranscribedUtterance {
  speakerLabel: string;
  startMs: number;
  endMs: number;
  text: string;
  words: TranscribedWord[];
}

export interface TranscriptionResult {
  utterances: TranscribedUtterance[];
}

export interface StartTranscriptionInput {
  /** Signed URL the provider fetches the source audio/video from. */
  mediaUrl: string;
  webhookUrl: string;
  webhookSecret: string;
}

export interface TranscriptionProvider {
  /** Kicks off an async transcription job; returns the provider's job id. */
  startTranscription(input: StartTranscriptionInput): Promise<string>;
  /** Fetches the finished result for a job id — called once the webhook fires. */
  fetchResult(providerJobId: string): Promise<TranscriptionResult>;
}

export class TranscriptionProviderError extends Error {}
