// Pure, dependency-free helpers for Log's content library: display labels,
// the required-components duration rule, and per-airing duration overrides.
// No "server-only" here — shared between server and client code, and kept
// testable under Vitest, per CLAUDE.md's testing expectations.
//
// No audio-path helpers here anymore: ENCO/DAD is WUWF's playback system of
// record (CLAUDE.md's "Log domain redesign" note) — inspecting the actual
// app confirmed the log-media bucket was write-only with nothing ever
// reading the audio back, so it was removed outright in favor of
// dad_cart_number, a plain descriptive reference to the item's identifier
// in ENCO/DAD.

import type { LogComponentType, LogContentType } from "@/lib/database.types";

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
  component_type: LogComponentType;
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

export interface AiringOverrides {
  override_duration_seconds?: number | null;
  override_live_intro_seconds?: number | null;
  override_live_outro_seconds?: number | null;
  override_tag_seconds?: number | null;
}

/**
 * The effective duration for one specific airing, honoring per-airing
 * overrides without ever touching the master content item or its
 * components (docs/log-design.md's "durable content vs. per-airing
 * overrides"). An explicit override_duration_seconds always wins outright.
 * Failing that, a finer live-intro/live-outro/tag override recomposes the
 * total from the master components, substituting the overridden value for
 * whichever component type it targets. With no overrides at all, this is
 * exactly computeTotalDurationSeconds.
 */
export function computeEffectiveDurationSeconds(
  components: ComponentDurationLike[],
  itemExpectedDurationSeconds: number | null,
  overrides: AiringOverrides = {},
): number | null {
  if (overrides.override_duration_seconds != null) {
    return overrides.override_duration_seconds;
  }

  const hasComponentOverride =
    overrides.override_live_intro_seconds != null ||
    overrides.override_live_outro_seconds != null ||
    overrides.override_tag_seconds != null;

  if (!hasComponentOverride) {
    return computeTotalDurationSeconds(components, itemExpectedDurationSeconds);
  }

  if (components.length === 0) {
    const summedOverrides =
      (overrides.override_live_intro_seconds ?? 0) +
      (overrides.override_live_outro_seconds ?? 0) +
      (overrides.override_tag_seconds ?? 0);
    return summedOverrides > 0 ? summedOverrides : itemExpectedDurationSeconds;
  }

  let total = 0;
  for (const component of components) {
    if (!component.required) continue;
    if (component.component_type === "live_intro" && overrides.override_live_intro_seconds != null) {
      total += overrides.override_live_intro_seconds;
    } else if (component.component_type === "live_outro" && overrides.override_live_outro_seconds != null) {
      total += overrides.override_live_outro_seconds;
    } else if (component.component_type === "optional_tag" && overrides.override_tag_seconds != null) {
      total += overrides.override_tag_seconds;
    } else {
      total += component.duration_seconds;
    }
  }
  return total;
}
