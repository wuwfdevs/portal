// Naming the voices of a transcript from what was said. AssemblyAI's Speaker Identification reads a finished transcript (made with
// speaker labels) and maps "A", "B"… to the names people gave aloud ("I'm Rosa, from Milton"). Pure: the request body, reading the
// answer, and which names are fit to show. The call itself is speaker-identification-run.ts.
//
// What it returns is a PROPOSAL. It is kept apart (tw_speakers.suggested_name), shown to a person to confirm, and never copied into
// display_name by code: a mono phone microphone in a room of overlapping voices will sometimes put a name on the wrong voice.

export const UNDERSTANDING_URL = "https://llm-gateway.assemblyai.com/v1/understanding";

/** The request: names inferred from the conversation, no list supplied. Medium effort, because a table runs far past ten minutes. */
export function speakerIdentificationBody(transcriptId: string, effort: "low" | "medium" = "medium"): Record<string, unknown> {
  return {
    transcript_id: transcriptId,
    speech_understanding: { request: { speaker_identification: { speaker_type: "name", effort } } },
  };
}

// A label or a role is not a name. These are what a model says when nobody said theirs.
const NOT_A_NAME = /^(speaker|voice|unknown|unidentified|unnamed|interviewer|interviewee|host|guest|participant|facilitator|moderator|attendee|audience|someone|person|man|woman)\b/i;

/** A first name worth proposing, or null: one to four words, no digits or addresses, not a label, not a role. */
export function cleanSuggestedName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (name.length < 1 || name.length > 60) return null;
  if (/\d/.test(name) || name.includes("@") || name.includes("/")) return null;
  if (/^[A-Za-z]$/.test(name)) return null;
  if (NOT_A_NAME.test(name)) return null;
  if (name.split(" ").length > 4) return null;
  return name;
}

/**
 * Reads the answer's `mapping` ({ "A": "Rosa" }) into the labels that got a usable name. Only a "success" answer counts. Two voices given
 * the same name are both dropped: the provider has probably folded one person into two, and a person should decide that.
 */
export function parseSpeakerMapping(payload: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof payload !== "object" || payload === null) return out;
  const response = (payload as { speech_understanding?: { response?: { speaker_identification?: { mapping?: unknown; status?: unknown } } } })
    .speech_understanding?.response?.speaker_identification;
  if (!response || response.status !== "success" || typeof response.mapping !== "object" || response.mapping === null) return out;
  const named = new Map<string, string>();
  for (const [label, value] of Object.entries(response.mapping as Record<string, unknown>)) {
    const name = cleanSuggestedName(value);
    if (name && label.length > 0 && label.length <= 20) named.set(label, name);
  }
  const counts = new Map<string, number>();
  for (const name of named.values()) counts.set(name.toLowerCase(), (counts.get(name.toLowerCase()) ?? 0) + 1);
  for (const [label, name] of named) if (counts.get(name.toLowerCase()) === 1) out.set(label, name);
  return out;
}

/**
 * The speaker range for a table of `people` (counting the facilitator). AssemblyAI treats the bounds as hard limits and advises a
 * little headroom above the count. The floor is lower than the count on purpose: somebody who sits at a table and never speaks cannot
 * be told apart from nobody, and a strict floor at the full count would split real speakers to find them.
 */
export function speakerRangeFor(people: number | null | undefined): { min: number; max: number } | null {
  if (people === null || people === undefined || !Number.isInteger(people) || people < 1 || people > 40) return null;
  return { min: Math.max(1, people - 2), max: people + 2 };
}
