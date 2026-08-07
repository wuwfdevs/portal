// Pure, dependency-free helpers for Log's content library: upload paths,
// display labels, and the required-components duration rule. No
// "server-only" here — shared between the client-side upload form and
// server code, and kept testable under Vitest, per CLAUDE.md's testing
// expectations (mirrors lib/transcription/media.ts).

import type { LogComponentType, LogContentType } from "@/lib/database.types";

export const LOG_MEDIA_BUCKET = "log-media";

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/x-m4a": "m4a",
};

export function isAllowedAudioType(contentType: string): boolean {
  return contentType in EXTENSION_BY_CONTENT_TYPE;
}

function extensionForContentType(contentType: string): string {
  return EXTENSION_BY_CONTENT_TYPE[contentType] ?? "bin";
}

/** A content item's own single-file audio, for an item with no separate components. */
export function contentItemAudioObjectPath(contentItemId: string, contentType: string): string {
  return `${contentItemId}/audio.${extensionForContentType(contentType)}`;
}

/** A specific component's audio (e.g. the recorded-audio part of a multi-component promo). */
export function contentComponentAudioObjectPath(
  contentItemId: string,
  componentId: string,
  contentType: string,
): string {
  return `${contentItemId}/components/${componentId}.${extensionForContentType(contentType)}`;
}

export const CONTENT_TYPE_LABEL: Record<LogContentType, string> = {
  news: "News",
  station_promo: "Station promo",
  program_promo: "Program promo",
  membership_message: "Membership message",
  university_announcement: "University announcement",
  psa: "PSA",
  legal_id: "Legal ID",
  interview_feature: "Interview / feature",
  host_created: "Host-created",
};

export const COMPONENT_TYPE_LABEL: Record<LogComponentType, string> = {
  live_intro: "Live intro",
  recorded_audio: "Recorded audio",
  live_outro: "Live outro",
  optional_tag: "Optional tag",
};

export interface ComponentDurationLike {
  duration_seconds: number;
  required: boolean;
}

/**
 * Total occupied time for a content item, per docs/log-design.md §2: "Total
 * occupied time is always the sum of required components; a 30-second promo
 * with a required 8-second outro is a 38-second commitment, never displayed
 * as 30." Optional components (optional_tag, or any component marked
 * required = false) never count toward this. Falls back to the item's own
 * expected_duration_seconds when it has no components at all (a simple
 * single-file item with no component breakdown).
 */
export function computeTotalDurationSeconds(
  components: ComponentDurationLike[],
  itemExpectedDurationSeconds: number | null,
): number | null {
  if (components.length === 0) return itemExpectedDurationSeconds;
  return components
    .filter((component) => component.required)
    .reduce((total, component) => total + component.duration_seconds, 0);
}
