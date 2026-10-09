import "server-only";
import { createClient } from "@/lib/supabase/server";
import { RESEARCH_MODEL } from "./model";
import { dataPointTag } from "./research";
import { resolveSpans } from "./extraction-units";
import { getLivePrompt, listResearchQuestions } from "./research-queries";
import { finishRun, startRun } from "./research-runs";
import {
  extractCandidates,
  loadExtractionContext,
  readSourceUnits,
  type ExtractionContext,
  type ReadSource,
} from "./extraction-run";
import type { CandidatePoint } from "./extraction-prompt";
import { matchTrialPoints, type TrialPoint, type TrialResults, type TrialSide } from "./trials";
import type { PromptSlot } from "./prompts";

// "Try this draft" (docs/sourcework-analysis-design.md §8.1): the live prompt
// and the editor's draft run on the same source with the same questions and
// notes, in parallel, and the answers are stored in sw_prompt_trials. Nothing is
// written to the project — no data points, no background, no excerpts. Only the
// extraction guide can be tried so far.

function toTrialPoints(
  candidates: readonly CandidatePoint[],
  source: ReadSource,
  labels: ReadonlyMap<string, string>,
): TrialPoint[] {
  const unitsById = new Map(source.units.map((unit) => [unit.id, unit]));
  return candidates.map((candidate) => ({
    claim: candidate.claim,
    tag: dataPointTag(
      {
        kind: candidate.kind,
        relevance: candidate.relevance,
        storyElement: candidate.storyElement,
        questionId: candidate.questionId,
      },
      labels,
    ),
    relevance: candidate.relevance,
    storyElement: candidate.storyElement,
    spans: resolveSpans(candidate.ranges, unitsById),
    unitIds: [...candidate.unitIds].sort((a, b) => a - b),
  }));
}

export type TrialResult = { ok: true; trialId: string } | { ok: false; error: string };

export async function runTrial(args: {
  slot: PromptSlot;
  draftBody: string;
  projectId: string;
  sourceId: string;
  userId: string;
}): Promise<TrialResult> {
  const { slot, draftBody, projectId, sourceId, userId } = args;
  if (slot !== "extraction") {
    return { ok: false, error: "Only the extraction guide can be tried so far." };
  }
  const supabase = await createClient();

  const read = await readSourceUnits(projectId, sourceId);
  if (!read.ok) return read;
  const loaded = await loadExtractionContext(projectId);
  if (!loaded.ok) return loaded;
  const context: ExtractionContext = loaded.context;
  const live = await getLivePrompt("extraction");
  const labels = new Map(
    (await listResearchQuestions(projectId)).map((question) => [question.id, question.label]),
  );

  const trial = await supabase
    .from("sw_prompt_trials")
    .insert({
      slot,
      draft_body: draftBody,
      live_version_id: live.versionId,
      project_id: projectId,
      source_id: sourceId,
      created_by: userId,
    })
    .select("id")
    .single();
  if (trial.error) {
    console.error("Could not start a prompt trial:", trial.error);
    return { ok: false, error: "Could not start the trial. Try again." };
  }
  const trialId = trial.data.id;

  const [liveRun, draftRun] = await Promise.all(
    [live.versionId, null].map((promptVersionId) =>
      startRun(supabase, {
        kind: "extraction",
        projectId,
        sourceId,
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
    for (const runId of runIds) if (runId) await finishRun(supabase, runId, { status: "failed", error });
    return { ok: false, error };
  }

  try {
    const [liveResult, draftResult] = await Promise.all([
      extractCandidates({ source: read.source, context, guide: live.body }),
      extractCandidates({ source: read.source, context, guide: draftBody }),
    ]);
    if (!liveResult.ok) return await fail(liveResult.error);
    if (!draftResult.ok) return await fail(draftResult.error);

    const liveSide: TrialSide = {
      label: live.version === null ? "Built-in" : `Live v${live.version}`,
      runId: runIds[0] ?? null,
      points: toTrialPoints(liveResult.value.candidates, read.source, labels),
    };
    const draftSide: TrialSide = {
      label: "Draft",
      runId: runIds[1] ?? null,
      points: toTrialPoints(draftResult.value.candidates, read.source, labels),
    };
    const results: TrialResults = {
      live: liveSide,
      draft: draftSide,
      rows: matchTrialPoints(liveSide.points, draftSide.points),
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
      runIds[0] ? finishRun(supabase, runIds[0], { status: "succeeded", counts: { side: "live", added: liveSide.points.length } }) : null,
      runIds[1] ? finishRun(supabase, runIds[1], { status: "succeeded", counts: { side: "draft", added: draftSide.points.length } }) : null,
    ]);
    return { ok: true, trialId };
  } catch (error) {
    console.error("Sourcework trial failed:", error);
    return await fail(error instanceof Error ? error.message : "The trial failed.");
  }
}
