"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/input";
import { SparklesIcon } from "@/components/ui/sparkles-icon";
import { Steps } from "@/components/ui/steps";
import { CONTROL_ROW } from "@/components/ui/control-row";
import { piecePath, projectPath } from "@/lib/transcription/links";
import { DIRECTION_MAX } from "@/lib/sourcework/piece-standards";
import { progressDetail, requestAnalysis } from "@/lib/sourcework/extract-stream";
import {
  AUTOPILOT_STOPS,
  acceptsWithoutReview,
  autopilotButtonLabel,
  autopilotPromise,
  autopilotRunSummary,
  planAutopilot,
  stepIndex,
  stepsFor,
  type AutopilotRunState,
  type AutopilotStepKey,
  type AutopilotStop,
} from "@/lib/sourcework/autopilot";
import { acceptSuggestedDataPoints } from "../research-actions";
import { acceptAllSuggestedClips } from "../review-actions";
import { createAutopilotPiece, getAutopilotSources } from "../autopilot-actions";

const POLL_MS = 5000;
const MAX_WAIT_MS = 45 * 60 * 1000;

class StepFailure extends Error {
  constructor(
    readonly step: AutopilotStepKey,
    message: string,
  ) {
    super(message);
  }
}

async function post<T>(url: string, body: unknown, fallback: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("The connection dropped. Check it and try again; finished steps are kept.");
  }
  const data = (await response.json().catch(() => null)) as
    ({ ok: true } & T) | { ok: false; error: string } | null;
  if (data && data.ok) return data;
  throw new Error(data && "error" in data ? data.error : fallback);
}

/**
 * "Run the remaining steps with AI": the dialog behind the project page's hand-over link. It chains
 * the same requests the manual path makes (wait for the transcripts, Analyze each source, accept what
 * it finds, Synthesize, Outline, Write from outline) and stops where the reporter chose to take
 * control back (docs/sourcework-analysis-design.md §25). It runs while this page is open; closing the
 * dialog keeps the run going, closing the page stops it after the current step, and a second click
 * resumes where it stopped. The default stop is Analyze, so Review stays the reporter's unless they
 * choose to go further.
 */
export function HandoverButton({
  projectId,
  formats,
  toAnalyze,
}: {
  projectId: string;
  formats: { id: string; name: string }[];
  /** Sources the run would analyze now, for the "this will run" summary. */
  toAnalyze: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stop, setStop] = useState<AutopilotStop>("analyze");
  const [formatId, setFormatId] = useState("");
  const [direction, setDirection] = useState("");
  const [state, setState] = useState<AutopilotRunState>({ phase: "idle" });
  const stopRef = useRef(false);
  const finished = useRef(new Set<AutopilotStepKey>());
  const piece = useRef<{ id: string; version: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const steps = stepsFor(stop);
  const running = state.phase === "running";

  function checkpoint(step: AutopilotStepKey) {
    if (stopRef.current) throw new StepFailure(step, "Stopped. Start again to carry on from here.");
  }
  const show = (step: AutopilotStepKey, detail: string | null = null) =>
    setState({ phase: "running", step, detail });

  async function waitForSources(): Promise<void> {
    const started = Date.now();
    for (;;) {
      checkpoint("wait");
      const result = await getAutopilotSources({ projectId });
      if (!result.ok) throw new StepFailure("wait", result.error);
      const plan = planAutopilot(result.sources);
      if (!plan.canRun) {
        throw new StepFailure("wait", "None of the sources can be used. Add one that processed.");
      }
      if (plan.waiting.length === 0) return;
      show(
        "wait",
        `${plan.waiting.length} ${plan.waiting.length === 1 ? "source is" : "sources are"} still processing`,
      );
      if (Date.now() - started > MAX_WAIT_MS) {
        throw new StepFailure("wait", "The transcripts are taking too long. Try again later.");
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }

  async function analyzeAll(): Promise<void> {
    const result = await getAutopilotSources({ projectId });
    if (!result.ok) throw new StepFailure("analyze", result.error);
    const plan = planAutopilot(result.sources);
    let done = 0;
    let failed = 0;
    let lastError = "";
    for (const target of plan.toAnalyze) {
      checkpoint("analyze");
      show("analyze", `${target.title} (${done + failed + 1} of ${plan.toAnalyze.length})`);
      const run = await requestAnalysis({
        projectId,
        sourceId: target.id,
        onProgress: (d, t) =>
          show(
            "analyze",
            `${target.title}${progressDetail(d, t) ? ` · ${progressDetail(d, t)}` : ""}`,
          ),
      });
      if (run.ok) done += 1;
      else {
        failed += 1;
        lastError = run.error;
      }
    }
    if (failed > 0 && done === 0 && plan.alreadyAnalyzed === 0) {
      throw new StepFailure("analyze", lastError || "Analyze didn't finish.");
    }
  }

  async function runAll() {
    stopRef.current = false;
    const todo = stepsFor(stop).map((step) => step.key);
    const once = async (key: AutopilotStepKey, work: () => Promise<void>) => {
      if (!todo.includes(key) || finished.current.has(key)) return;
      show(key);
      try {
        await work();
      } catch (error) {
        if (error instanceof StepFailure) throw error;
        throw new StepFailure(key, error instanceof Error ? error.message : "That step failed.");
      }
      finished.current.add(key);
    };

    try {
      await once("wait", waitForSources);
      await once("analyze", analyzeAll);
      if (stop === "analyze") {
        setState({ phase: "done" });
        setOpen(false);
        router.push(projectPath(projectId, "review"));
        return;
      }
      await once("accept", async () => {
        const sources = await getAutopilotSources({ projectId });
        if (!sources.ok) throw new Error(sources.error);
        const points = await acceptSuggestedDataPoints({ projectId });
        if (!points.ok) throw new Error(points.error);
        const clips = await acceptAllSuggestedClips({
          projectId,
          sourceIds: sources.sources.filter((s) => !s.failed).map((s) => s.id),
        });
        if (!clips.ok) throw new Error(clips.error);
      });
      await once("synthesize", async () => {
        await post("/api/sourcework/synthesize", { projectId }, "Synthesis didn't finish.");
      });
      if (stop === "synthesize") {
        setState({ phase: "done" });
        setOpen(false);
        router.push(projectPath(projectId, "synthesis"));
        return;
      }
      if (!piece.current) {
        show("outline");
        const created = await createAutopilotPiece({ projectId, formatId: formatId || null });
        if (!created.ok) throw new StepFailure("outline", created.error);
        piece.current = { id: created.pieceId, version: created.version };
      }
      const target = piece.current;
      await once("outline", async () => {
        const result = await post<{ version: number }>(
          "/api/sourcework/pieces/outline",
          {
            pieceId: target.id,
            formatId: formatId || null,
            direction,
            expectVersion: target.version,
          },
          "The outline didn't finish.",
        );
        target.version = result.version;
      });
      if (stop === "outline") {
        setState({ phase: "done" });
        setOpen(false);
        router.push(piecePath(projectId, target.id));
        return;
      }
      await once("write", async () => {
        const result = await post<{ version: number }>(
          "/api/sourcework/pieces/expand",
          {
            pieceId: target.id,
            formatId: formatId || null,
            direction,
            expectVersion: target.version,
          },
          "Writing didn't finish.",
        );
        target.version = result.version;
      });
      setState({ phase: "done" });
      setOpen(false);
      router.push(piecePath(projectId, target.id));
    } catch (error) {
      const failure =
        error instanceof StepFailure
          ? error
          : new StepFailure("wait", error instanceof Error ? error.message : "That didn't finish.");
      setState({ phase: "failed", step: failure.step, error: failure.message });
    }
  }

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const reachesPiece = stop === "outline" || stop === "write";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-ui font-semibold text-brand-link hover:underline max-lg:min-h-11"
      >
        <SparklesIcon className="h-3.5 w-3.5" />
        {running ? "Running…" : "Run the remaining steps with AI…"}
      </button>
      {running && !open && (
        <span className="text-xs text-ink-500" role="status">
          {state.detail ?? steps[stepIndex(state, steps)]?.label}
        </span>
      )}

      {open && (
        <div
          className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-16"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="handover-heading"
            className="w-full max-w-xl rounded border border-line bg-white p-5 shadow-lg sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="handover-heading" className="font-serif text-xl font-bold text-ink-900">
                  Run the remaining steps with AI
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-500">
                  Runs the same steps you would run by hand, from where the project is now. Stop at
                  any step; what has finished is kept, and every result can be redone or edited.
                </p>
              </div>
              <Button
                ref={closeRef}
                type="button"
                variant="link"
                onClick={() => setOpen(false)}
                className="shrink-0 text-ink-500 hover:text-ink-700"
              >
                Close
              </Button>
            </div>

            <fieldset className="mt-5 flex flex-col gap-2" disabled={running}>
              <legend className="mb-2 text-sm font-bold text-ink-700">
                Hand control back to me after
              </legend>
              {AUTOPILOT_STOPS.map((entry) => (
                <label
                  key={entry.value}
                  className={`flex cursor-pointer items-start gap-3 rounded border px-3.5 py-3 text-sm ${
                    stop === entry.value
                      ? "border-brand-primary bg-brand-surface/40"
                      : "border-line bg-white hover:border-brand-primary"
                  }`}
                >
                  <input
                    type="radio"
                    name="handover-stop"
                    value={entry.value}
                    checked={stop === entry.value}
                    onChange={() => setStop(entry.value)}
                    className="mt-1"
                  />
                  <span>
                    <strong className="text-ink-900">{entry.title}</strong>
                    <span className="block text-ink-500">{entry.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {reachesPiece && (
              <div className="mt-4 grid gap-4 sm:grid-cols-[12.5rem_minmax(0,1fr)]">
                <div>
                  <Label htmlFor="handover-format">
                    Format <span className="font-normal text-ink-400">(optional)</span>
                  </Label>
                  <Select
                    id="handover-format"
                    value={formatId}
                    disabled={running}
                    onChange={(event) => setFormatId(event.target.value)}
                  >
                    <option value="">No format</option>
                    {formats.map((format) => (
                      <option key={format.id} value={format.id}>
                        {format.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="handover-direction">
                    Direction <span className="font-normal text-ink-400">(optional)</span>
                  </Label>
                  <Textarea
                    id="handover-direction"
                    rows={2}
                    value={direction}
                    maxLength={DIRECTION_MAX}
                    disabled={running}
                    onChange={(event) => setDirection(event.target.value)}
                    placeholder="Open on the neighbours with chainsaws."
                  />
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-1.5 border-t border-line pt-4 text-sm text-ink-700">
              <strong>This will run</strong>
              <span>{autopilotRunSummary(stop, toAnalyze) || "Nothing left to do."}</span>
              <span className="text-xs text-ink-500">{autopilotPromise(stop)}</span>
              {acceptsWithoutReview(stop) && (
                <Alert variant="warning" className="mt-2">
                  Going past Analyze accepts every suggested finding and clip without your review.
                  They can be put back for review afterwards.
                </Alert>
              )}
            </div>

            {state.phase !== "idle" && (
              <Steps
                className="mt-4"
                label="Run steps"
                steps={steps.map((step) => ({ label: step.label }))}
                current={stepIndex(state, steps)}
                busy={running}
                busyNote={running ? (state.detail ?? undefined) : undefined}
              />
            )}
            {state.phase === "failed" && (
              <Alert variant="danger" className="mt-3">
                {state.error} Finished steps are kept; starting again carries on from this one.
              </Alert>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-ink-500">
                {running
                  ? "Keep this page open. Leaving stops the run after the step it is on."
                  : "Keep this page open while it runs."}
              </span>
              <div className={CONTROL_ROW}>
                {running ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      stopRef.current = true;
                    }}
                  >
                    Stop after this step
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                )}
                <Button type="button" ai disabled={running} onClick={() => void runAll()}>
                  {running
                    ? "Working…"
                    : state.phase === "failed"
                      ? "Carry on"
                      : autopilotButtonLabel(stop)}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
