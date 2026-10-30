import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { RESEARCH_MODEL } from "./model";
import { computePieceLength } from "./pieces";
import { readFormatSpec, type FormatSpec } from "./piece-formats";
import { generateOutline, type GeneratedOutline } from "./piece-outline-run";
import type { PieceExcerpt } from "./piece-queries";
import { getLivePrompt } from "./research-queries";
import { trialSide, type FormatTrialResults, type FormatTrialSide } from "./piece-format-trials";
import { finishRun, startRun } from "./research-runs";

// "Try this draft" for a piece format (docs/sourcework-analysis-design.md §6.3, §8.1): the live
// version and the editor's draft each outline a piece from the same project's accepted findings and
// excerpts, in parallel. Results go in sw_piece_format_trials; nothing is written to the project.

export type FormatTrialRun = { ok: true; trialId: string } | { ok: false; error: string };

function sideFrom(
  label: string,
  spec: FormatSpec,
  picker: readonly PieceExcerpt[],
  outline: Extract<GeneratedOutline, { ok: true }>,
): FormatTrialSide {
  const length = computePieceLength(outline.blocks, picker);
  return trialSide({
    label,
    spec,
    blocks: outline.blocks,
    perBlockSeconds: length.perBlock,
    excerpts: new Map(
      picker.map((record) => [
        record.id,
        { title: record.title, speaker: record.speaker, text: record.text },
      ]),
    ),
    warnings: outline.warnings,
  });
}

export async function runFormatTrial(args: {
  formatId: string;
  draftSpec: FormatSpec;
  projectId: string;
  direction: string;
  userId: string;
}): Promise<FormatTrialRun> {
  const supabase = await createClient();
  const format = unwrapRead(
    await supabase
      .from("sw_piece_formats")
      .select("id, name, live_version_id")
      .eq("id", args.formatId)
      .maybeSingle(),
    "this piece format",
  );
  if (!format) return { ok: false, error: "That format doesn't exist." };
  const liveRow = format.live_version_id
    ? unwrapRead(
        await supabase
          .from("sw_piece_format_versions")
          .select("id, version, spec")
          .eq("id", format.live_version_id)
          .maybeSingle(),
        "the live version of this format",
      )
    : null;
  const liveSpec = liveRow ? readFormatSpec(liveRow.spec) : null;

  const trial = await supabase
    .from("sw_piece_format_trials")
    .insert({
      format_id: format.id,
      draft_spec: args.draftSpec as never,
      live_version_id: liveRow?.id ?? null,
      project_id: args.projectId,
      direction: args.direction,
      created_by: args.userId,
    })
    .select("id")
    .single();
  if (trial.error) {
    console.error("Could not start a format trial:", trial.error);
    return { ok: false, error: "Could not start the trial. Try again." };
  }
  const trialId = trial.data.id;

  const sides = [
    ...(liveRow && liveSpec ? [{ versionId: liveRow.id, spec: liveSpec }] : []),
    { versionId: null, spec: args.draftSpec },
  ];
  const guide = await getLivePrompt("outline");
  const runs = await Promise.all(
    sides.map((side) =>
      startRun(supabase, {
        kind: "outline",
        projectId: args.projectId,
        sourceId: null,
        formatVersionId: side.versionId,
        promptVersionId: guide.versionId,
        trial: true,
        model: RESEARCH_MODEL,
        userId: args.userId,
      }),
    ),
  );
  const runIds = runs.map((run) => (run.ok ? run.runId : null));

  async function fail(error: string): Promise<FormatTrialRun> {
    await supabase
      .from("sw_piece_format_trials")
      .update({ status: "failed", error, finished_at: new Date().toISOString() })
      .eq("id", trialId);
    for (const runId of runIds) {
      if (runId) await finishRun(supabase, runId, { status: "failed", error });
    }
    return { ok: false, error };
  }

  try {
    const outlines = await Promise.all(
      sides.map((side) =>
        generateOutline({
          projectId: args.projectId,
          format: { name: format.name, spec: side.spec, versionId: side.versionId },
          targetSeconds: null,
          direction: args.direction,
          guide,
        }),
      ),
    );
    for (const outline of outlines) if (!outline.ok) return await fail(outline.error);

    const built = outlines.map((outline, index) => {
      if (!outline.ok) throw new Error("unreachable");
      const isLive = sides[index]!.versionId !== null;
      return sideFrom(
        isLive ? `Live v${liveRow!.version}` : "Draft",
        sides[index]!.spec,
        outline.picker,
        outline,
      );
    });
    const results: FormatTrialResults = {
      kind: "format",
      live: sides[0]!.versionId ? built[0]! : null,
      draft: built[built.length - 1]!,
    };
    const saved = await supabase
      .from("sw_piece_format_trials")
      .update({
        status: "succeeded",
        results: results as never,
        finished_at: new Date().toISOString(),
      })
      .eq("id", trialId);
    if (saved.error) throw new Error(saved.error.message);

    await Promise.all(
      runIds.map((runId, index) =>
        runId
          ? finishRun(supabase, runId, {
              status: "succeeded",
              counts: {
                side: sides[index]!.versionId ? "live" : "draft",
                blocks: built[index]!.blocks.length,
                clip_seconds: built[index]!.clipSeconds,
              },
            })
          : null,
      ),
    );
    return { ok: true, trialId };
  } catch (error) {
    console.error("Sourcework format trial failed:", error);
    return await fail(error instanceof Error ? error.message : "The trial failed.");
  }
}
