// Pure logic for "Develop into pitch" (design doc §8). Deliberately does NOT
// duplicate Editorial Planning's pitch form or its field definitions — it
// builds a URL to Editorial Planning's own /editorial/pitches/new, which
// reads a handful of well-known field keys from its query string as initial
// values for the exact same schema-driven form every other pitch goes
// through (see that page's own searchParams handling). Editorial Inquiry
// never writes an ep_pitches row directly.

import { labelForEvidentiaryStatus, type ContextNoteRecord, type QuestionRecord } from "./tree";

const TITLE_MAX_LENGTH = 200;

export interface PitchHandoffDraft {
  title: string;
  centralQuestion: string;
  primaryPillar: string;
  sourcesMaterials: string;
  whyNow: string;
}

/**
 * What can honestly be carried forward from a promoted story question: the
 * question itself, the inquiry's guiding pillar, and a draft assembled from
 * inherited context notes — never fabricated. `pillarName` should be the
 * pillar's CURRENT name (looked up live), not the inquiry's own snapshot, so
 * it matches one of Editorial Planning's presently-valid select options.
 */
export function buildPitchHandoffDraft(params: {
  storyQuestion: Pick<QuestionRecord, "text">;
  pillarName: string;
  inheritedNotes: ContextNoteRecord[];
}): PitchHandoffDraft {
  const text = params.storyQuestion.text.trim();
  const title = text.length > TITLE_MAX_LENGTH ? `${text.slice(0, TITLE_MAX_LENGTH - 1)}…` : text;

  const sourcesMaterials = params.inheritedNotes
    .map((n) => {
      const source = n.sourceUrl ? ` (${n.sourceTitle ?? n.sourceUrl})` : "";
      return `[${labelForEvidentiaryStatus(n.evidentiaryStatus)}] ${n.body}${source}`;
    })
    .join("\n\n");

  // Only the notes that read as an actual development, never a hunch —
  // design doc §8: "never fabricated if nothing qualifies."
  const whyNow = params.inheritedNotes
    .filter(
      (n) => n.evidentiaryStatus === "established_fact" || n.evidentiaryStatus === "web_finding",
    )
    .map((n) => `${n.body}${n.sourceUrl ? ` (${n.sourceTitle ?? n.sourceUrl})` : ""}`)
    .join("\n\n");

  return {
    title,
    centralQuestion: text,
    primaryPillar: params.pillarName,
    sourcesMaterials,
    whyNow,
  };
}

/** Field keys match ep_form_fields.key exactly — see NewPitchPage's own searchParams handling. */
export function pitchHandoffUrl(draft: PitchHandoffDraft): string {
  const params = new URLSearchParams();
  params.set("title", draft.title);
  params.set("central_question", draft.centralQuestion);
  params.set("primary_pillar", draft.primaryPillar);
  if (draft.sourcesMaterials) params.set("sources_materials", draft.sourcesMaterials);
  if (draft.whyNow) params.set("why_now", draft.whyNow);
  return `/editorial/pitches/new?${params.toString()}`;
}
