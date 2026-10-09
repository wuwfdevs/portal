import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isStaleRun } from "./run-state";

// The audit-log half of every model run (docs/sourcework-analysis-design.md
// §4.7): open a run, close it. Not a queue — see the migration's header. A run
// holds a partial unique index while it is in flight, so a double click cannot
// start two; one that died with its request is closed by whoever retries.

type Client = SupabaseClient<Database>;
type RunKind = "context" | "extraction";

export type StartedRun =
  { ok: true; runId: string } | { ok: false; error: string; alreadyRunning: boolean };

export async function startRun(
  supabase: Client,
  args: {
    kind: RunKind;
    projectId: string;
    sourceId: string | null;
    promptVersionId: string | null;
    trial: boolean;
    model: string;
    userId: string;
  },
): Promise<StartedRun> {
  const row = {
    kind: args.kind,
    project_id: args.projectId,
    source_id: args.sourceId,
    prompt_version_id: args.promptVersionId,
    trial: args.trial,
    model: args.model,
    created_by: args.userId,
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    const inserted = await supabase.from("sw_analysis_runs").insert(row).select("id").single();
    if (!inserted.error) return { ok: true, runId: inserted.data.id };
    // 23505 = the one-running-per-source (or per-project, for background) index.
    if (inserted.error.code !== "23505") {
      console.error("Could not open a research run:", inserted.error);
      return { ok: false, error: "Could not start the run. Try again.", alreadyRunning: false };
    }
    if (args.trial) {
      // Trials never hold the index (they are excluded from it); a conflict here is not ours.
      return { ok: false, error: "Could not start the run. Try again.", alreadyRunning: false };
    }

    let existing = supabase
      .from("sw_analysis_runs")
      .select("id, started_at")
      .eq("project_id", args.projectId)
      .eq("kind", args.kind)
      .eq("trial", false)
      .eq("status", "running");
    existing = args.sourceId
      ? existing.eq("source_id", args.sourceId)
      : existing.is("source_id", null);
    const found = await existing.maybeSingle();
    if (found.error) {
      console.error("Could not read the running research run:", found.error);
      return { ok: false, error: "Could not start the run. Try again.", alreadyRunning: false };
    }
    if (!found.data || !isStaleRun(found.data.started_at)) {
      return {
        ok: false,
        error:
          args.kind === "extraction"
            ? "This source is already being extracted."
            : "Background is already being gathered for this project.",
        alreadyRunning: true,
      };
    }
    // It died with its request. Close it and take over.
    const closed = await supabase
      .from("sw_analysis_runs")
      .update({
        status: "failed",
        error: "Interrupted: the request ended before the run finished.",
        finished_at: new Date().toISOString(),
      })
      .eq("id", found.data.id)
      .eq("status", "running");
    if (closed.error) {
      console.error("Could not close a stale research run:", closed.error);
      return { ok: false, error: "Could not start the run. Try again.", alreadyRunning: false };
    }
  }
  return { ok: false, error: "Could not start the run. Try again.", alreadyRunning: true };
}

export async function finishRun(
  supabase: Client,
  runId: string,
  outcome:
    | { status: "succeeded"; counts: Record<string, unknown>; queries?: string[] }
    | { status: "failed"; error: string; counts?: Record<string, unknown> },
): Promise<void> {
  const { error } = await supabase
    .from("sw_analysis_runs")
    .update({
      status: outcome.status,
      counts: (outcome.counts ?? {}) as never,
      ...(outcome.status === "succeeded" && outcome.queries
        ? { queries: outcome.queries as never }
        : {}),
      error: outcome.status === "failed" ? outcome.error : null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
  // A run left "running" is recovered by staleness, so this is logged, not thrown over a result the user already has.
  if (error) console.error("Could not close a research run:", error);
}
