"use client";

// Upload → preview → confirm for the program-log import. The plan the
// preview renders is exactly the plan the confirm submits (serialized
// through state) — one computation drives both, and the Server Actions
// re-check access and re-validate on every call.

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { controlClasses } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import type { ItemPlan, ProgramLogPlan } from "@/lib/log/program-log-plan";
import {
  executeProgramLogImport,
  parseProgramLogUpload,
  type ExecuteImportResult,
} from "../import-actions";

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function itemKindLabel(item: ItemPlan): string {
  if (item.kind === "credit") return "credit";
  if (item.kind === "content") return "library";
  return "live read";
}

export function ImportClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<ProgramLogPlan | null>(null);
  const [result, setResult] = useState<ExecuteImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const upload = () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a program-log export (.pdf) first.");
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      setError(null);
      setResult(null);
      const response = await parseProgramLogUpload(formData);
      if (response.ok) setPlan(response.plan);
      else setError(response.error);
    });
  };

  const confirm = () => {
    if (!plan) return;
    startTransition(async () => {
      setError(null);
      const response = await executeProgramLogImport(JSON.stringify(plan));
      if (response.ok) {
        setResult(response);
        setPlan(null);
      } else {
        setError(response.error);
      }
    });
  };

  const creatable = plan?.rundowns.filter((rundown) => rundown.existingRundownId === null) ?? [];
  const newCopy = plan?.copyPlans.filter((copy) => copy.existingCopyId === null) ?? [];
  const reusedCopy = plan?.copyPlans.filter((copy) => copy.existingCopyId !== null) ?? [];

  return (
    <div className="flex flex-col gap-5">
      {error && <Alert variant="danger">{error}</Alert>}

      {result?.ok && (
        <div className="rounded border border-line bg-panel-50 p-4">
          <h2 className="text-sm font-bold text-ink-900">Import complete</h2>
          <p className="mt-1 text-sm text-ink-700">
            {result.rundowns.filter((rundown) => rundown.skippedReason === null).length} rundown
            {result.rundowns.filter((rundown) => rundown.skippedReason === null).length === 1 ? "" : "s"}{" "}
            created · {result.copyCreated} new copy record{result.copyCreated === 1 ? "" : "s"} (
            {result.underwritersCreated} new underwriter{result.underwritersCreated === 1 ? "" : "s"}) ·{" "}
            {result.copyReused} reused from the library.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {result.rundowns.map((rundown) => (
              <li key={`${rundown.programName}-${rundown.rundownId ?? "skipped"}`} className="text-sm">
                {rundown.rundownId ? (
                  <Link
                    href={`/log/rundowns/${rundown.rundownId}`}
                    className="font-semibold text-ink-900 underline underline-offset-2"
                  >
                    {rundown.programName}
                  </Link>
                ) : (
                  <span className="font-semibold text-ink-900">{rundown.programName}</span>
                )}{" "}
                {rundown.skippedReason ? (
                  <span className="text-ink-500">— {rundown.skippedReason}</span>
                ) : (
                  <span className="text-ink-500">
                    — {rundown.breaks} breaks, {rundown.items} items
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!plan && (
        <div className="flex flex-col items-start gap-3 rounded border border-line p-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className={cn(controlClasses, "max-w-md")}
            aria-label="Program-log export file"
          />
          <Button type="button" onClick={upload} disabled={pending}>
            {pending ? "Reading…" : "Preview import"}
          </Button>
        </div>
      )}

      {plan && (
        <>
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-ink-900">{plan.airDate || "Unknown date"}</h2>
            <Button type="button" onClick={confirm} disabled={pending || creatable.length === 0}>
              {pending ? "Importing…" : `Import ${creatable.length} rundown${creatable.length === 1 ? "" : "s"}`}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setPlan(null);
                setError(null);
              }}
              disabled={pending}
            >
              Start over
            </Button>
          </div>

          {plan.warnings.length > 0 && (
            <Alert variant="note">
              <ul className="list-disc pl-4">
                {plan.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Alert>
          )}

          {/* Every break and every item, not counts: this list is the review.
              The model's reading is not checked by anything else before it
              is written, so what a host sees here is what gets imported. */}
          <section className="rounded border border-line">
            <h3 className="border-b border-line bg-panel-50 px-4 py-2 text-xs font-bold tracking-wide text-ink-500 uppercase">
              Rundowns
            </h3>
            <ul className="divide-y divide-line">
              {plan.rundowns.map((rundown) => (
                <li key={rundown.programId} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-sm font-semibold text-ink-900">{rundown.programName}</span>
                    <span className="text-xs text-ink-500">
                      {rundown.shiftStartTime.slice(0, 5)} · {rundown.shiftDurationMinutes} min ·{" "}
                      {rundown.breaks.length} break{rundown.breaks.length === 1 ? "" : "s"} ·{" "}
                      {rundown.breaks.reduce((sum, brk) => sum + brk.items.length, 0)} items
                    </span>
                    {rundown.existingRundownId !== null && (
                      <Badge variant="warning">already exists — will be skipped</Badge>
                    )}
                  </div>
                  {rundown.breaks.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {rundown.breaks.map((brk) => (
                        <li key={`${brk.time}-${brk.label}`} className="text-xs">
                          <div className="flex flex-wrap items-baseline gap-x-2 text-ink-700">
                            <span className="font-mono">{brk.time}</span>
                            <span className="font-semibold">{brk.label}</span>
                            <span className="text-ink-500">{formatSeconds(brk.availableDurationSeconds)} window</span>
                            {brk.items.length === 0 && <span className="text-ink-500">— empty</span>}
                          </div>
                          {brk.items.length > 0 && (
                            <ul className="mt-0.5 ml-4 flex flex-col gap-0.5 border-l border-line pl-3">
                              {brk.items.map((item, index) => (
                                <li key={index} className="flex flex-wrap items-baseline gap-x-2 text-ink-700">
                                  <Badge>{itemKindLabel(item)}</Badge>
                                  <span>{item.title}</span>
                                  <span className="text-ink-500">{formatSeconds(item.durationSeconds)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
              {plan.rundowns.length === 0 && (
                <li className="px-4 py-2.5 text-sm text-ink-500">No rundowns could be planned.</li>
              )}
            </ul>
          </section>

          <section className="rounded border border-line">
            <h3 className="border-b border-line bg-panel-50 px-4 py-2 text-xs font-bold tracking-wide text-ink-500 uppercase">
              Underwriting credits
            </h3>
            <ul className="divide-y divide-line">
              {newCopy.map((copy) => (
                <li key={copy.key} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-sm font-semibold text-ink-900">{copy.underwriterName}</span>
                    <span className="text-xs text-ink-500">
                      {copy.label}
                      {copy.cart !== null && ` · cart ${copy.cart}`}
                      {copy.durationSeconds !== null && ` · ${formatSeconds(copy.durationSeconds)}`}
                      {` · airs ${copy.airings}×`}
                    </span>
                    <Badge variant="success">new{copy.underwriterIsNew ? " underwriter" : " copy"}</Badge>
                  </div>
                  {copy.script !== null && (
                    <p className="mt-1 text-xs whitespace-pre-wrap text-ink-700">{copy.script}</p>
                  )}
                </li>
              ))}
              {reusedCopy.map((copy) => (
                <li key={copy.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
                  <span className="text-sm font-semibold text-ink-900">{copy.underwriterName}</span>
                  <span className="text-xs text-ink-500">
                    {copy.label}
                    {copy.cart !== null && ` · cart ${copy.cart}`}
                    {` · airs ${copy.airings}×`}
                  </span>
                  <Badge>reusing existing copy</Badge>
                  {copy.scriptChanged && (
                    <Badge variant="warning">script differs from the library&apos;s</Badge>
                  )}
                </li>
              ))}
              {plan.copyPlans.length === 0 && (
                <li className="px-4 py-2.5 text-sm text-ink-500">
                  No scheduled credits with scripts appear in this export.
                </li>
              )}
            </ul>
          </section>

          {(plan.unresolved.length > 0 || plan.notes.length > 0) && (
            <section className="rounded border border-line">
              <h3 className="border-b border-line bg-panel-50 px-4 py-2 text-xs font-bold tracking-wide text-ink-500 uppercase">
                Not imported
              </h3>
              <ul className="divide-y divide-line">
                {plan.unresolved.map((row) => (
                  <li key={`${row.time}-${row.description}`} className="px-4 py-2 text-xs text-ink-700">
                    <span className="font-mono">{row.time}</span>{" "}
                    <span className="font-semibold">{row.description}</span>{" "}
                    <span className="text-ink-500">— {row.reason}</span>
                  </li>
                ))}
                {plan.notes.map((note) => (
                  <li key={`${note.time}-${note.description}`} className="px-4 py-2 text-xs text-ink-500">
                    <span className="font-mono">{note.time}</span> {note.description} — operational note,
                    not imported
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
