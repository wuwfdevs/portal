import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { getProjectById } from "@/lib/transcription/projects";
import { RESEARCH_MODEL } from "./model";
import { callStructuredModel } from "./extraction-ai";
import { readSourceUnits, type ReadSource } from "./extraction-run";
import { finishRun, startRun } from "./research-runs";
import { getLivePrompt } from "./research-queries";
import { getThemeDetail } from "./theme-queries";
import {
  QUOTE_FRAMING,
  MAX_POINTS_PER_RUN,
  buildQuoteInput,
  buildQuoteOutputSchema,
  countShownWords,
  parseQuoteOutput,
  selectContextUnits,
  type QuotePointInput,
} from "./quote-prompt";
import { sameStretch } from "./quotes";
import type { ExtractionUnit } from "./extraction-units";

// Suggest quotes for one theme, end to end (docs/sourcework-analysis-design.md §5.5).
//
// The model reads the theme's accepted supporting data points and, for each source, the
// transcript around them, and proposes clips. It returns sentence numbers; this file turns
// them into times and words and writes suggestions. Nothing is an excerpt until a person
// accepts it. A run replaces only the suggestions still waiting, and never proposes a
// stretch a person already accepted or rejected.

export interface QuoteRunOutcome {
  runId: string;
  /** Suggestions now waiting for a decision. */
  suggested: number;
  /** Proposed clips that landed on a stretch already decided. */
  skippedDecided: number;
  /** Sources that were left out because they have no ready transcript. */
  skippedSources: number;
}

export type QuoteRunResult = ({ ok: true } & QuoteRunOutcome) | { ok: false; error: string };

export async function suggestQuotes(args: {
  projectId: string;
  themeId: string;
  userId: string;
}): Promise<QuoteRunResult> {
  const { projectId, themeId, userId } = args;
  const supabase = await createClient();

  const project = await getProjectById(projectId);
  if (!project) return { ok: false, error: "That project doesn't exist." };
  const sourceTitles = new Map(
    project.sources.map((entry) => [entry.sourceId, entry.source.title]),
  );

  const detail = await getThemeDetail(projectId, themeId, sourceTitles);
  if (!detail) return { ok: false, error: "That theme doesn't exist." };
  if (detail.theme.status !== "accepted" || detail.mergedIntoId) {
    return { ok: false, error: "Quotes can be suggested for an accepted theme. Accept it first." };
  }

  // The supporting evidence that points at a recording, grouped by source, in the order it is spoken.
  const supporting = detail.evidence
    .filter((entry) => entry.item.stance === "supports")
    .filter((entry) => entry.spans.some((span) => span.kind === "temporal"))
    .sort(
      (a, b) =>
        a.item.sourceTitle.localeCompare(b.item.sourceTitle) || a.item.position - b.item.position,
    )
    .slice(0, MAX_POINTS_PER_RUN);
  if (supporting.length === 0) {
    return {
      ok: false,
      error:
        "This theme has no accepted supporting data points from a recording yet. Accept some in the sources, or add them from this page.",
    };
  }

  const sourceIds = [...new Set(supporting.map((entry) => entry.item.sourceId))];
  const read = await Promise.all(sourceIds.map((sourceId) => readSourceUnits(projectId, sourceId)));
  const ready: { source: ReadSource; shown: ExtractionUnit[]; points: QuotePointInput[] }[] = [];
  // Point numbers are global across the sources the model reads; this maps them back to data points.
  const pointsByNumber = new Map<number, string>();
  let number = 0;
  let skippedSources = 0;
  let firstError: string | null = null;
  sourceIds.forEach((sourceId, index) => {
    const result = read[index]!;
    if (!result.ok) {
      skippedSources += 1;
      firstError ??= result.error;
      return;
    }
    const points: QuotePointInput[] = supporting
      .filter((entry) => entry.item.sourceId === sourceId)
      .map((entry) => {
        pointsByNumber.set(number + 1, entry.item.dataPointId);
        return {
          number: ++number,
          claim: entry.item.claim,
          speaker: null,
          spans: entry.spans,
        };
      });
    const shown = selectContextUnits(result.source.units, points);
    if (shown.length > 0) ready.push({ source: result.source, shown, points });
  });
  if (ready.length === 0) {
    return { ok: false, error: firstError ?? "There is no transcript to choose quotes from." };
  }

  // What a person already decided for this theme: never proposed again.
  const decidedRows =
    unwrapRead(
      await supabase
        .from("sw_quote_suggestions")
        .select("source_id, start_ms, end_ms")
        .eq("theme_id", themeId)
        .in("status", ["accepted", "rejected"]),
      "this theme's decided quotes",
    ) ?? [];

  const live = await getLivePrompt("quote_quality");
  const started = await startRun(supabase, {
    kind: "quote_suggest",
    projectId,
    sourceId: null,
    themeId,
    promptVersionId: live.versionId,
    trial: false,
    model: RESEARCH_MODEL,
    userId,
  });
  if (!started.ok) return { ok: false, error: started.error };
  const runId = started.runId;

  try {
    const sources = ready.map((entry, index) => ({
      number: index + 1,
      title: entry.source.sourceTitle,
      units: entry.source.units,
      groups: entry.source.groups,
      speakerByUnit: entry.source.speakerByUnit,
      points: entry.points,
      shown: entry.shown,
    }));

    const called = await callStructuredModel({
      step: "quote selection",
      schemaName: "quotes",
      schema: buildQuoteOutputSchema(),
      framing: QUOTE_FRAMING,
      guide: live.body,
      input: buildQuoteInput({
        themeTitle: detail.theme.title,
        themeDefinition: detail.theme.definition,
        sources,
      }),
    });
    if (!called.ok) {
      await finishRun(supabase, runId, { status: "failed", error: called.error });
      return { ok: false, error: called.error };
    }

    const parsed = parseQuoteOutput(
      called.text,
      sources.map((source) => ({
        shown: source.shown,
        speakerByUnit: source.speakerByUnit,
        pointNumbers: source.points.map((point) => point.number),
      })),
    );
    const droppedTotal = Object.values(parsed.dropped).reduce((sum, count) => sum + count, 0);
    if (parsed.dropped.unreadable > 0 && parsed.quotes.length === 0) {
      const error = "The quote step returned an answer that couldn't be read. Try again.";
      await finishRun(supabase, runId, { status: "failed", error });
      return { ok: false, error };
    }

    const fresh = parsed.quotes.filter((quote) => {
      const sourceId = ready[quote.sourceIndex]!.source.sourceId;
      return !decidedRows.some(
        (decided) =>
          decided.source_id === sourceId &&
          sameStretch({ startMs: decided.start_ms, endMs: decided.end_ms }, quote),
      );
    });
    const skippedDecided = parsed.quotes.length - fresh.length;

    let written = 0;
    if (fresh.length > 0) {
      const rows = fresh.map((quote) => {
        const entry = ready[quote.sourceIndex]!;
        const text = entry.shown
          .filter((unit) => unit.id >= quote.firstUnit && unit.id <= quote.lastUnit)
          .map((unit) => unit.text)
          .join(" ");
        return {
          // Chosen here so the points below don't depend on the order rows come back in.
          id: crypto.randomUUID(),
          project_id: projectId,
          theme_id: themeId,
          source_id: entry.source.sourceId,
          representation_id: entry.source.representationId,
          speaker_id: quote.speakerId,
          start_ms: quote.startMs,
          end_ms: quote.endMs,
          quote_text: text,
          reason: quote.why,
          tier: quote.tier,
          run_id: runId,
          prompt_version_id: live.versionId,
          created_by: userId,
        };
      });
      const inserted = await supabase.from("sw_quote_suggestions").insert(rows);
      if (inserted.error) {
        throw new Error(`Could not save the suggested quotes: ${inserted.error.message}`);
      }

      const links = rows.flatMap((row, index) => {
        const ids = fresh[index]!.pointIndexes.map((pointIndex) =>
          pointsByNumber.get(pointIndex + 1),
        ).filter((id): id is string => Boolean(id));
        return [...new Set(ids)].map((dataPointId) => ({
          suggestion_id: row.id,
          data_point_id: dataPointId,
        }));
      });
      if (links.length > 0) {
        const linked = await supabase.from("sw_quote_suggestion_points").insert(links);
        if (linked.error) {
          // Suggestions without the data points they rest on can't be accepted properly; take them back.
          await supabase.from("sw_quote_suggestions").delete().eq("run_id", runId);
          throw new Error(`Could not save what the quotes rest on: ${linked.error.message}`);
        }
      }
      written = rows.length;
    }

    // The new suggestions are in; only now do the earlier run's still-waiting ones go.
    const cleared = await supabase
      .from("sw_quote_suggestions")
      .delete()
      .eq("theme_id", themeId)
      .eq("status", "suggested")
      .or(`run_id.is.null,run_id.neq.${runId}`);
    if (cleared.error) {
      throw new Error(`Could not replace the earlier suggestions: ${cleared.error.message}`);
    }

    await finishRun(supabase, runId, {
      status: "succeeded",
      counts: {
        points: supporting.length,
        sources: ready.length,
        words_read: ready.reduce((sum, entry) => sum + countShownWords(entry.shown), 0),
        suggested: written,
        skipped_decided: skippedDecided,
        dropped: parsed.dropped,
        dropped_total: droppedTotal,
      },
    });
    return { ok: true, runId, suggested: written, skippedDecided, skippedSources };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Suggesting quotes failed.";
    console.error("Sourcework quote suggestion failed:", error);
    await finishRun(supabase, runId, { status: "failed", error: message });
    return { ok: false, error: message };
  }
}
