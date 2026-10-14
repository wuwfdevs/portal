"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { Steps } from "@/components/ui/steps";
import { piecePath, projectPath } from "@/lib/transcription/links";
import { DIRECTION_MAX } from "@/lib/sourcework/piece-standards";
import { progressDetail, requestAnalysis } from "@/lib/sourcework/extract-stream";
import {
  autopilotPromise,
  planAutopilot,
  stepIndex,
  stepsFor,
  type AutopilotMode,
  type AutopilotRunState,
  type AutopilotStepKey,
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
 * Upload a stack of sources, then write a story from them in one go: wait for the transcripts, Analyze
 * each source, accept what it finds, Synthesize, Outline and Write from outline, ending on the piece
 * (docs/sourcework-analysis-design.md §25). It chains the same requests the manual path makes and runs
 * while this page is open; closing it stops after the current step and a second click resumes where it
 * stopped. "Let me review first" stops after Analyze and opens the Review tab instead: the middle path.
 */
export function AutopilotPanel({
  projectId,
  formats,
}: {
  projectId: string;
  formats: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<AutopilotMode>("story");
  const [formatId, setFormatId] = useState("");
  const [direction, setDirection] = useState("");
  const [state, setState] = useState<AutopilotRunState>({ phase: "idle" });
  const stopRef = useRef(false);
  const finished = useRef(new Set<AutopilotStepKey>());
  const piece = useRef<{ id: string; version: number } | null>(null);

  const steps = stepsFor(mode);
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
    const todo = stepsFor(mode).map((step) => step.key);
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
      if (mode === "review_first") {
        setState({ phase: "done" });
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
      router.push(piecePath(projectId, target.id));
    } catch (error) {
      const failure =
        error instanceof StepFailure
          ? error
          : new StepFailure("wait", error instanceof Error ? error.message : "That didn't finish.");
      setState({ phase: "failed", step: failure.step, error: failure.message });
    }
  }

  return (
    <section aria-labelledby="autopilot-heading" className="mt-8">
      <SectionHeading level="eyebrow" id="autopilot-heading" className="mb-2 items-center">
        Write a story from these sources
      </SectionHeading>
      <div className="flex flex-col gap-4 rounded border border-line bg-white p-4 sm:p-5">
        <p className="max-w-2xl text-sm text-ink-700">
          The fewest clicks from a stack of sources to a first draft. Every step is the same one you
          can run by hand on the other tabs, so you can stop anywhere, or do any step yourself.
        </p>

        <div className="flex flex-col gap-2" role="radiogroup" aria-label="How much to hand over">
          {(
            [
              ["story", "Do all of it", "Analyze, accept, synthesize, outline and write a draft."],
              [
                "review_first",
                "Let me review first",
                "Analyze every source, then stop at the Review tab so I decide what to keep.",
              ],
            ] as const
          ).map(([value, title, hint]) => (
            <label key={value} className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input
                type="radio"
                name="autopilot-mode"
                value={value}
                checked={mode === value}
                disabled={running}
                onChange={() => setMode(value)}
                className="mt-1"
              />
              <span>
                <strong className="text-ink-900">{title}</strong>
                <span className="block text-ink-500">{hint}</span>
              </span>
            </label>
          ))}
        </div>

        {mode === "story" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="autopilot-format">
                Format <span className="font-normal text-ink-400">(optional)</span>
              </Label>
              <Select
                id="autopilot-format"
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
              <Label htmlFor="autopilot-direction">
                Direction <span className="font-normal text-ink-400">(optional)</span>
              </Label>
              <Textarea
                id="autopilot-direction"
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

        {state.phase !== "idle" && (
          <Steps
            label="Story steps"
            steps={steps.map((step) => ({ label: step.label }))}
            current={stepIndex(state, steps)}
            busy={running}
            busyNote={running ? (state.detail ?? undefined) : undefined}
          />
        )}
        {state.phase === "failed" && (
          <Alert variant="danger">
            {state.error} Finished steps are kept; starting again carries on from this one.
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" ai disabled={running} onClick={() => void runAll()}>
            {running
              ? "Working…"
              : state.phase === "failed"
                ? "Carry on"
                : mode === "story"
                  ? "Write the story"
                  : "Analyze and review"}
          </Button>
          {running && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                stopRef.current = true;
              }}
            >
              Stop after this step
            </Button>
          )}
          <p className="max-w-xl text-xs text-ink-500">{autopilotPromise(mode)}</p>
        </div>
        {running && (
          <p className="text-xs text-ink-500">
            Keep this page open. It can take several minutes a source; leaving stops the run after
            the step it is on.
          </p>
        )}
      </div>
    </section>
  );
}
