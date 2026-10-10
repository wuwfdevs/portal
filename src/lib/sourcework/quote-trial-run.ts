import "server-only";
import { createClient } from "@/lib/supabase/server";
import { RESEARCH_MODEL } from "./model";
import { finishRun, startRun } from "./research-runs";
import { getLivePrompt } from "./research-queries";
import { loadQuoteContext, proposeQuotes, type ProposedQuote } from "./quote-run";
import {
  matchTrialQuotes,
  type QuoteTrialResults,
  type QuoteTrialSide,
  type TrialQuote,
} from "./quote-trials";
import type { TrialResult } from "./trial-run";

// "Try this draft" for the quote quality guide (docs/sourcework-analysis-design.md §8.1): the live
// guide and the editor's draft each choose clips from the same theme, in parallel, and the two lists
// are stored in sw_prompt_trials. Nothing is written to the project — no suggestions, no excerpts.

function toTrialQuote(quote: ProposedQuote): TrialQuote {
  return {
    sourceId: quote.sourceId,
    sourceTitle: quote.sourceTitle,
    startMs: quote.startMs,
    endMs: quote.endMs,
    text: quote.text,
    tier: quote.tier,
    why: quote.why,
    stance: quote.stance,
  };
}

export async function runQuoteTrial(args: {
  draftBody: string;
  projectId: string;
  themeId: string;
  userId: string;
}): Promise<TrialResult> {
  const { draftBody, projectId, themeId, userId } = args;
  const supabase = await createClient();

  const loaded = await loadQuoteContext(projectId, themeId);
  if (!loaded.ok) return loaded;
  const { context } = loaded;
  const live = await getLivePrompt("quote_quality");

  const trial = await supabase
    .from("sw_prompt_trials")
    .insert({
      slot: "quote_quality",
      draft_body: draftBody,
      live_version_id: live.versionId,
      project_id: projectId,
      theme_id: themeId,
      created_by: userId,
    })
    .select("id")
    .single();
  if (trial.error) {
    console.error("Could not start a quote trial:", trial.error);
    return { ok: false, error: "Could not start the trial. Try again." };
  }
  const trialId = trial.data.id;

  const [liveRun, draftRun] = await Promise.all(
    [live.versionId, null].map((promptVersionId) =>
      startRun(supabase, {
        kind: "quote_suggest",
        projectId,
        sourceId: null,
        themeId,
        promptVersionId,
        trial: true,
        model: RESEARCH_MODEL,
        userId,
      }),
    ),
  );
  const runIds = [liveRun, draftRun].map((run) => (run?.ok ? run.runId : null));

  async function fail(error: string): Promise<TrialResult> {
    await supabase
      .from("sw_prompt_trials")
      .update({ status: "failed", error, finished_at: new Date().toISOString() })
      .eq("id", trialId);
    for (const runId of runIds)
      if (runId) await finishRun(supabase, runId, { status: "failed", error });
    return { ok: false, error };
  }

  try {
    const [liveResult, draftResult] = await Promise.all([
      proposeQuotes({ context, guide: live.body }),
      proposeQuotes({ context, guide: draftBody }),
    ]);
    if (!liveResult.ok) return await fail(liveResult.error);
    if (!draftResult.ok) return await fail(draftResult.error);

    const liveSide: QuoteTrialSide = {
      label: live.version === null ? "Built-in" : `Live v${live.version}`,
      runId: runIds[0] ?? null,
      quotes: liveResult.quotes.map(toTrialQuote),
    };
    const draftSide: QuoteTrialSide = {
      label: "Draft",
      runId: runIds[1] ?? null,
      quotes: draftResult.quotes.map(toTrialQuote),
    };
    const results: QuoteTrialResults = {
      kind: "quotes",
      live: liveSide,
      draft: draftSide,
      rows: matchTrialQuotes(liveSide.quotes, draftSide.quotes),
    };

    const saved = await supabase
      .from("sw_prompt_trials")
      .update({
        status: "succeeded",
        results: results as never,
        finished_at: new Date().toISOString(),
      })
      .eq("id", trialId);
    if (saved.error) throw new Error(saved.error.message);

    await Promise.all([
      runIds[0]
        ? finishRun(supabase, runIds[0], {
            status: "succeeded",
            counts: { side: "live", suggested: liveSide.quotes.length },
          })
        : null,
      runIds[1]
        ? finishRun(supabase, runIds[1], {
            status: "succeeded",
            counts: { side: "draft", suggested: draftSide.quotes.length },
          })
        : null,
    ]);
    return { ok: true, trialId };
  } catch (error) {
    console.error("Sourcework quote trial failed:", error);
    return await fail(error instanceof Error ? error.message : "The trial failed.");
  }
}
