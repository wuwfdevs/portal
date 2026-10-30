// The messages that cross between the apps. Types only: each side validates what it receives.
// A document in the publish channel is a `ContentDocument` from @wuwf/content-blocks.

import type { ContentDocument } from "@wuwf/content-blocks";

/** Paths each app exposes for the contracts. Receivers mount exactly these. */
export const CONTRACT_PATHS = {
  /** Portal → site: create or update a CMS draft from a piece. */
  publishCandidates: "/api/portal/publish-candidates",
  /** Site → Portal: tell the Portal the status of something it sent. */
  publishStatus: "/api/site/publish-status",
  /** Site → Portal: ask for transcription of audio. */
  transcriptionRequests: "/api/site/transcription-requests",
  /** Portal → site: return a finished transcript through the publish channel. */
  transcripts: "/api/portal/transcripts",
} as const;

/** The request body of a send to the publish-candidates endpoint. */
export type PublishCandidateRequest = ContentDocument;

/** Returned to the Portal: the draft that now exists. A later send of the same piece adds a version of it. */
export interface PublishCandidateResponse {
  draftId: string;
  /** Link to the draft in the CMS admin. */
  adminUrl: string;
  /** The draft's version number after this send. */
  draftVersion: number;
  /** "created" for a first send of this piece, "versioned" when it added to an existing draft. */
  outcome: "created" | "versioned";
}

export type PublishState = "draft" | "published" | "unpublished";

/** Site → Portal, when a candidate's state changes. */
export interface PublishStatusEvent {
  pieceId: string;
  draftId: string;
  state: PublishState;
  /** Present once published. */
  canonicalUrl?: string;
  occurredAt: string;
}

export type TranscriptionSubject =
  | { kind: "audience_answer"; answerId: string; listeningQueryId: string }
  | { kind: "episode_audio"; episodeId: string; showSlug: string };

/** Site → Portal: send audio for transcription. The media is a short-lived signed URL, never a public one. */
export interface TranscriptionRequest {
  subject: TranscriptionSubject;
  media: { url: string; mimeType: string; sha256?: string; durationMs?: number };
  /** Opaque value echoed back, so the site can match the transcript. */
  correlationId: string;
}

export interface TranscriptionAccepted {
  accepted: true;
  /** The Portal's project for the work, so staff can open it. */
  portalProjectId: string;
}

/** Portal → site: a finished transcript, returned as a document through the publish channel. */
export interface TranscriptDelivery {
  correlationId: string;
  subject: TranscriptionSubject;
  document: ContentDocument;
}
