import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { UNDERSTANDING_URL, parseSpeakerMapping, speakerIdentificationBody } from "./speaker-identification";

/** How long to wait for the provider's answer. It reads a whole transcript, so this is generous; the caller is never a person waiting. */
const TIMEOUT_MS = 150_000;

type Admin = SupabaseClient<Database>;

/**
 * Asks AssemblyAI to name the voices of a finished transcript, and stores what it proposes as `tw_speakers.suggested_name`. Best effort
 * by design: a transcript that landed is complete without names, so every failure here is logged (the status, never the body) and
 * swallowed. A suggestion never replaces a name a person gave, and it is only stored for a voice that has no name yet.
 * Returns how many suggestions were stored.
 */
export async function suggestSpeakerNames(supabase: Admin, representationId: string, providerJobId: string): Promise<number> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) return 0;

  let payload: unknown;
  try {
    const response = await fetch(process.env.ASSEMBLYAI_UNDERSTANDING_URL?.trim() || UNDERSTANDING_URL, {
      method: "POST",
      headers: { authorization: apiKey, "content-type": "application/json" },
      body: JSON.stringify(speakerIdentificationBody(providerJobId)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error(`[transcription] speaker identification answered ${response.status}`);
      return 0;
    }
    payload = await response.json();
  } catch (error) {
    console.error("[transcription] speaker identification failed:", error instanceof Error ? error.name : "unknown error");
    return 0;
  }

  const mapping = parseSpeakerMapping(payload);
  let stored = 0;
  for (const [label, name] of mapping) {
    const { data, error } = await supabase
      .from("tw_speakers")
      .update({ suggested_name: name })
      .eq("representation_id", representationId)
      .eq("diarization_label", label)
      .is("display_name", null)
      .select("id");
    if (error) console.error("[transcription] could not store a suggested speaker name:", error.message);
    else stored += data?.length ?? 0;
  }
  return stored;
}
