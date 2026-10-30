// The messages that cross between the apps. Types only: each side validates what it receives.
//
// Only what is built or planned for the current milestones is here. A Sourcework-to-CMS publish channel was
// designed and then deferred by the owner (2026-10-30), so its messages and the block schema they carried were
// removed rather than left as dead code; if it returns it needs a fresh design (see apps/site/ROADMAP.md).

/** Paths each app exposes for the contracts. Receivers mount exactly these. */
export const CONTRACT_PATHS = {
  /** Portal → site: the browser lands here carrying a short-lived identity token. */
  identitySignIn: "/api/portal/sso",
  /** Site → Portal: ask for transcription of audio (Milestone 2). */
  transcriptionRequests: "/api/site/transcription-requests",
} as const;

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
