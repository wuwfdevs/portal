import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { speakerDisplayLabel } from "@/lib/transcription/transcript";
import { chunked } from "./research-queries";
import { compareQuotes, type QuoteSuggestion } from "./quotes";

// Reads behind the suggested-quotes screen and the theme page's Excerpts panel
// (docs/sourcework-analysis-design.md §5.5). Everything goes through the caller's session,
// so RLS is still the boundary, and a failed read throws rather than rendering as an
// empty state.

const SUGGESTION_COLUMNS =
  "id, theme_id, source_id, representation_id, speaker_id, start_ms, end_ms, quote_text, reason, tier, status, excerpt_id";

/**
 * Every suggestion for a theme, decided ones included (the aside counts them and a
 * reporter can see what they accepted), in the order they should be reviewed. A source
 * the project no longer has is left out, the rule the data points follow.
 */
export async function listQuoteSuggestions(
  themeId: string,
  sourceTitles: ReadonlyMap<string, string>,
): Promise<QuoteSuggestion[]> {
  const supabase = await createClient();
  const rows =
    unwrapRead(
      await supabase
        .from("sw_quote_suggestions")
        .select(SUGGESTION_COLUMNS)
        .eq("theme_id", themeId)
        .order("created_at"),
      "this theme's suggested quotes",
    ) ?? [];
  const current = rows.filter((row) => sourceTitles.has(row.source_id));

  const speakerIds = [
    ...new Set(current.map((row) => row.speaker_id).filter((id): id is string => Boolean(id))),
  ];
  const speakers = new Map<string, string>();
  for (const ids of chunked(speakerIds)) {
    for (const speaker of unwrapRead(
      await supabase
        .from("tw_speakers")
        .select("id, diarization_label, display_name")
        .in("id", ids),
      "these quotes' speakers",
    ) ?? []) {
      speakers.set(
        speaker.id,
        speakerDisplayLabel(speaker.diarization_label, speaker.display_name),
      );
    }
  }

  return current
    .map<QuoteSuggestion>((row) => ({
      id: row.id,
      themeId: row.theme_id,
      sourceId: row.source_id,
      sourceTitle: sourceTitles.get(row.source_id) ?? "Source",
      representationId: row.representation_id,
      speakerName: row.speaker_id ? (speakers.get(row.speaker_id) ?? null) : null,
      startMs: row.start_ms,
      endMs: row.end_ms,
      text: row.quote_text,
      reason: row.reason,
      tier: row.tier,
      status: row.status,
      excerptId: row.excerpt_id,
    }))
    .sort(compareQuotes);
}

/** Whether Suggest quotes has ever finished for a theme, so an empty list can say why it is empty. */
export async function hasQuoteRun(themeId: string): Promise<boolean> {
  const supabase = await createClient();
  const rows =
    unwrapRead(
      await supabase
        .from("sw_analysis_runs")
        .select("id")
        .eq("theme_id", themeId)
        .eq("kind", "quote_suggest")
        .eq("trial", false)
        .eq("status", "succeeded")
        .limit(1),
      "this theme's quote runs",
    ) ?? [];
  return rows.length > 0;
}

/** How many suggestions wait for a decision on a theme, for the button's label on its page. */
export async function countWaitingQuotes(themeId: string): Promise<number> {
  const supabase = await createClient();
  const result = await supabase
    .from("sw_quote_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("theme_id", themeId)
    .eq("status", "suggested");
  if (result.error)
    throw new Error(`Couldn't read this theme's suggested quotes: ${result.error.message}`);
  return result.count ?? 0;
}

export interface ThemeExcerpt {
  id: string;
  title: string;
  text: string;
  startMs: number;
  endMs: number;
  sourceId: string;
  sourceTitle: string;
}

/**
 * A theme's representative quotes: the temporal excerpts that exemplify its data points
 * (`sw_data_point_excerpts`). There is no theme-to-excerpt table — the link runs through
 * the evidence, so a data point taken out of the theme takes its quote with it.
 */
export async function listThemeExcerpts(
  dataPointIds: readonly string[],
  sourceTitles: ReadonlyMap<string, string>,
): Promise<ThemeExcerpt[]> {
  if (dataPointIds.length === 0) return [];
  const supabase = await createClient();

  const excerptIds = new Set<string>();
  for (const ids of chunked(dataPointIds)) {
    for (const row of unwrapRead(
      await supabase.from("sw_data_point_excerpts").select("excerpt_id").in("data_point_id", ids),
      "this theme's excerpts",
    ) ?? []) {
      excerptIds.add(row.excerpt_id);
    }
  }

  const excerpts: ThemeExcerpt[] = [];
  for (const ids of chunked([...excerptIds])) {
    for (const row of unwrapRead(
      await supabase
        .from("sw_source_excerpts")
        .select("id, title, excerpt_text, start_ms, end_ms, source_id")
        .in("id", ids)
        .eq("locator_kind", "temporal"),
      "this theme's excerpts",
    ) ?? []) {
      if (row.start_ms === null || row.end_ms === null || !sourceTitles.has(row.source_id))
        continue;
      excerpts.push({
        id: row.id,
        title: row.title,
        text: row.excerpt_text,
        startMs: row.start_ms,
        endMs: row.end_ms,
        sourceId: row.source_id,
        sourceTitle: sourceTitles.get(row.source_id) ?? "Source",
      });
    }
  }
  return excerpts.sort(
    (a, b) => a.sourceTitle.localeCompare(b.sourceTitle) || a.startMs - b.startMs,
  );
}

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
