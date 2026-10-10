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
  type ParsedQuote,
  type QuotePointInput,
  type QuoteDropReason,
} from "./quote-prompt";
import { quoteStance, sameStretch, type QuoteStance, type QuoteTier } from "./quotes";
import type { ExtractionUnit } from "./extraction-units";

// Suggest quotes for one theme, end to end (docs/sourcework-analysis-design.md §5.5).
//
// The model reads the theme's accepted data points that point into a recording — supporting and
// complicating alike — and, for each source, the transcript around them, and proposes clips. It
// returns sentence numbers; this file turns them into times and words. Reading and asking
// (loadQuoteContext, proposeQuotes) write nothing, so "Try this draft" can run them twice;
// suggestQuotes then writes suggestions. Nothing is an excerpt until a person accepts it. A run
// replaces only the suggestions still waiting, and never proposes a stretch a person already
// accepted or rejected.

export interface QuoteContext {
  themeTitle: string;
  themeDefinition: string;
  ready: { source: ReadSource; shown: ExtractionUnit[]; points: QuotePointInput[] }[];
  /** Global point number -> the data point behind it. */
  pointsByNumber: Map<number, { id: string; stance: QuoteStance }>;
  pointCount: number;
  skippedSources: number;
}

export type QuoteContextResult = { ok: true; context: QuoteContext } | { ok: false; error: string };

/** Reads the theme's evidence and the transcript around it. Writes nothing. */
export async function loadQuoteContext(
  projectId: string,
  themeId: string,
): Promise<QuoteContextResult> {
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

  // Evidence that points into a recording, supporting first when there is more than a run can read,
  // then grouped by source in the order it is spoken.
  const byRecording = detail.evidence.filter((entry) =>
    entry.spans.some((span) => span.kind === "temporal"),
  );
  const chosen = [
    ...byRecording.filter((entry) => entry.item.stance === "supports"),
    ...byRecording.filter((entry) => entry.item.stance === "complicates"),
  ]
    .slice(0, MAX_POINTS_PER_RUN)
    .sort(
      (a, b) =>
        a.item.sourceTitle.localeCompare(b.item.sourceTitle) || a.item.position - b.item.position,
    );
  if (chosen.length === 0) {
    return {
      ok: false,
      error:
        "This theme has no accepted data points from a recording yet. Accept some in the sources, or add them from this page.",
    };
  }

  const sourceIds = [...new Set(chosen.map((entry) => entry.item.sourceId))];
  const read = await Promise.all(sourceIds.map((sourceId) => readSourceUnits(projectId, sourceId)));
  const ready: QuoteContext["ready"] = [];
  // Point numbers are global across the sources the model reads; this maps them back to data points.
  const pointsByNumber = new Map<number, { id: string; stance: QuoteStance }>();
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
    const points: QuotePointInput[] = chosen
      .filter((entry) => entry.item.sourceId === sourceId)
      .map((entry) => {
        number += 1;
        pointsByNumber.set(number, { id: entry.item.dataPointId, stance: entry.item.stance });
        return {
          number,
          claim: entry.item.claim,
          stance: entry.item.stance,
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

  return {
    ok: true,
    context: {
      themeTitle: detail.theme.title,
      themeDefinition: detail.theme.definition,
      ready,
      pointsByNumber,
      pointCount: chosen.length,
      skippedSources,
    },
  };
}

export interface ProposedQuote {
  sourceId: string;
  sourceTitle: string;
  representationId: string;
  speakerId: string | null;
  startMs: number;
  endMs: number;
  text: string;
  tier: QuoteTier;
  why: string;
  stance: QuoteStance;
  dataPointIds: string[];
}

export type ProposeResult =
  | {
      ok: true;
      quotes: ProposedQuote[];
      dropped: Record<QuoteDropReason, number>;
      wordsRead: number;
    }
  | { ok: false; error: string };

/** One model call over a loaded context with the given guide text. Writes nothing. */
export async function proposeQuotes(args: {
  context: QuoteContext;
  guide: string;
}): Promise<ProposeResult> {
  const { context, guide } = args;
  const sources = context.ready.map((entry, index) => ({
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
    guide,
    input: buildQuoteInput({
      themeTitle: context.themeTitle,
      themeDefinition: context.themeDefinition,
      sources,
    }),
  });
  if (!called.ok) return called;

  const parsed = parseQuoteOutput(
    called.text,
    sources.map((source) => ({
      shown: source.shown,
      speakerByUnit: source.speakerByUnit,
      pointNumbers: source.points.map((point) => point.number),
    })),
  );
  if (parsed.dropped.unreadable > 0 && parsed.quotes.length === 0) {
    return {
      ok: false,
      error: "The quote step returned an answer that couldn't be read. Try again.",
    };
  }

  const quotes = parsed.quotes.map((quote: ParsedQuote): ProposedQuote => {
    const entry = context.ready[quote.sourceIndex]!;
    const linked = quote.pointIndexes
      .map((pointIndex) => context.pointsByNumber.get(pointIndex + 1))
      .filter((point): point is { id: string; stance: QuoteStance } => Boolean(point));
    return {
      sourceId: entry.source.sourceId,
      sourceTitle: entry.source.sourceTitle,
      representationId: entry.source.representationId,
      speakerId: quote.speakerId,
      startMs: quote.startMs,
      endMs: quote.endMs,
      text: entry.shown
        .filter((unit) => unit.id >= quote.firstUnit && unit.id <= quote.lastUnit)
        .map((unit) => unit.text)
        .join(" "),
      tier: quote.tier,
      why: quote.why,
      stance: quoteStance(linked.map((point) => point.stance)),
      dataPointIds: [...new Set(linked.map((point) => point.id))],
    };
  });
  return {
    ok: true,
    quotes,
    dropped: parsed.dropped,
    wordsRead: context.ready.reduce((sum, entry) => sum + countShownWords(entry.shown), 0),
  };
}

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

  const loaded = await loadQuoteContext(projectId, themeId);
  if (!loaded.ok) return loaded;
  const { context } = loaded;

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
    const proposed = await proposeQuotes({ context, guide: live.body });
    if (!proposed.ok) {
      await finishRun(supabase, runId, { status: "failed", error: proposed.error });
      return proposed;
    }
    // What a person already decided for this theme: never proposed again. Read now, after the model
    // call (a minute or two), not before it: a card accepted or rejected while it ran must count.
    const decidedRows =
      unwrapRead(
        await supabase
          .from("sw_quote_suggestions")
          .select("source_id, start_ms, end_ms")
          .eq("theme_id", themeId)
          .in("status", ["accepted", "rejected"]),
        "this theme's decided quotes",
      ) ?? [];

    const droppedTotal = Object.values(proposed.dropped).reduce((sum, count) => sum + count, 0);

    const fresh = proposed.quotes.filter(
      (quote) =>
        !decidedRows.some(
          (decided) =>
            decided.source_id === quote.sourceId &&
            sameStretch({ startMs: decided.start_ms, endMs: decided.end_ms }, quote),
        ),
    );
    const skippedDecided = proposed.quotes.length - fresh.length;

    let written = 0;
    if (fresh.length > 0) {
      const rows = fresh.map((quote) => ({
        // Chosen here so the points below don't depend on the order rows come back in.
        id: crypto.randomUUID(),
        project_id: projectId,
        theme_id: themeId,
        source_id: quote.sourceId,
        representation_id: quote.representationId,
        speaker_id: quote.speakerId,
        start_ms: quote.startMs,
        end_ms: quote.endMs,
        quote_text: quote.text,
        reason: quote.why,
        tier: quote.tier,
        run_id: runId,
        prompt_version_id: live.versionId,
        created_by: userId,
      }));
      const inserted = await supabase.from("sw_quote_suggestions").insert(rows);
      if (inserted.error) {
        throw new Error(`Could not save the suggested quotes: ${inserted.error.message}`);
      }

      const links = rows.flatMap((row, index) =>
        fresh[index]!.dataPointIds.map((dataPointId) => ({
          suggestion_id: row.id,
          data_point_id: dataPointId,
        })),
      );
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
        points: context.pointCount,
        sources: context.ready.length,
        words_read: proposed.wordsRead,
        suggested: written,
        skipped_decided: skippedDecided,
        dropped: proposed.dropped,
        dropped_total: droppedTotal,
      },
    });
    return {
      ok: true,
      runId,
      suggested: written,
      skippedDecided,
      skippedSources: context.skippedSources,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Suggesting quotes failed.";
    console.error("Sourcework quote suggestion failed:", error);
    await finishRun(supabase, runId, { status: "failed", error: message });
    return { ok: false, error: message };
  }
}
