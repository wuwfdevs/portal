import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { speakerDisplayLabel } from "@/lib/transcription/transcript";
import { chunked } from "./research-queries";
import type { QuoteSuggestion } from "./quotes";

// Reads behind a source's clips to review (docs/sourcework-analysis-design.md §20). Everything goes
// through the caller's session, so RLS is still the boundary, and a failed read throws rather than
// rendering as an empty state.

const SUGGESTION_COLUMNS =
  "id, source_id, representation_id, speaker_id, start_ms, end_ms, quote_text, reason, status, excerpt_id";

/** For each given data point, the excerpts that exemplify it (what a card's "Excerpt:" line names). */
export async function listExcerptsForDataPoints(
  dataPointIds: readonly string[],
): Promise<Map<string, { excerptId: string; title: string }[]>> {
  const result = new Map<string, { excerptId: string; title: string }[]>();
  if (dataPointIds.length === 0) return result;
  const supabase = await createClient();

  const links: { data_point_id: string; excerpt_id: string }[] = [];
  for (const ids of chunked(dataPointIds)) {
    links.push(
      ...(unwrapRead(
        await supabase
          .from("sw_data_point_excerpts")
          .select("data_point_id, excerpt_id")
          .in("data_point_id", ids),
        "these data points' excerpts",
      ) ?? []),
    );
  }
  if (links.length === 0) return result;

  const titles = new Map<string, string>();
  for (const ids of chunked([...new Set(links.map((link) => link.excerpt_id))])) {
    for (const row of unwrapRead(
      await supabase.from("sw_source_excerpts").select("id, title").in("id", ids),
      "these data points' excerpts",
    ) ?? []) {
      titles.set(row.id, row.title);
    }
  }
  for (const link of links) {
    const title = titles.get(link.excerpt_id);
    if (title === undefined) continue;
    const list = result.get(link.data_point_id) ?? [];
    list.push({ excerptId: link.excerpt_id, title });
    result.set(link.data_point_id, list);
  }
  return result;
}

/**
 * The clips Analyze proposed for a source that are still waiting for a decision in the order they occur. The source workspace's Data points layer lists them beside
 * the findings; accepting one writes an ordinary excerpt, rejecting one hides it.
 */
export async function listWaitingClipsForSource(sourceId: string): Promise<QuoteSuggestion[]> {
  const supabase = await createClient();
  const [rows, sourceRows] = await Promise.all([
    supabase
      .from("sw_quote_suggestions")
      .select(SUGGESTION_COLUMNS)
      .eq("source_id", sourceId)
      .eq("status", "suggested")
      .order("start_ms")
      .then((result) => unwrapRead(result, "this source's suggested clips") ?? []),
    supabase
      .from("sw_sources")
      .select("title")
      .eq("id", sourceId)
      .maybeSingle()
      .then((result) => unwrapRead(result, "this source's title")),
  ]);
  if (rows.length === 0) return [];

  const speakerIds = [
    ...new Set(rows.map((row) => row.speaker_id).filter((id): id is string => Boolean(id))),
  ];
  const speakers = new Map<string, string>();
  for (const ids of chunked(speakerIds)) {
    for (const speaker of unwrapRead(
      await supabase
        .from("tw_speakers")
        .select("id, diarization_label, display_name")
        .in("id", ids),
      "these clips' speakers",
    ) ?? []) {
      speakers.set(
        speaker.id,
        speakerDisplayLabel(speaker.diarization_label, speaker.display_name),
      );
    }
  }

  return rows.map<QuoteSuggestion>((row) => ({
    id: row.id,
    sourceId: row.source_id,
    sourceTitle: sourceRows?.title ?? "Source",
    representationId: row.representation_id,
    speakerName: row.speaker_id ? (speakers.get(row.speaker_id) ?? null) : null,
    startMs: row.start_ms,
    endMs: row.end_ms,
    text: row.quote_text,
    reason: row.reason,
    status: row.status,
    excerptId: row.excerpt_id,
  }));
}
