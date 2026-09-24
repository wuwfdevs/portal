"use client";

// Upload → preview → confirm for the program-log import. The plan the
// preview renders is exactly the plan the confirm submits (serialized
// through state) — one computation drives both, and the Server Actions
// re-check access and re-validate on every call.
//
// The preview is the review: nothing checks the model's reading of the
// export before it is written (docs/log-design.md §8, 2026-09-22), so what
// a host confirms here is what gets imported. It is laid out by what needs
// a human's eyes — the items being placed, new underwriters and copy, the
// library scripts that will change, anything unresolved — and folds away
// what doesn't: open clock opportunities nothing was placed in, unchanged
// reuse of library copy, operational notes. Break times are the clock's —
// the export's breaks are aligned onto the program's clock before the
// preview (program-log-clock-alignment.ts), and a break shows where it
// landed relative to that clock. A first cut listed everything with equal
// weight and ran to several screens of "1:00 window — empty".

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { controlClasses } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import type {
  BreakPlan,
  CopyPlan,
  ItemPlan,
  ProgramLogPlan,
  RundownPlan,
} from "@/lib/log/program-log-plan";
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

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function itemKindLabel(item: ItemPlan): string {
  if (item.kind === "credit") return "credit";
  if (item.kind === "content") return "library";
  return "live read";
}

const SECTION_HEADING =
  "border-b border-line bg-panel-50 px-4 py-2 text-xs font-bold tracking-wide text-ink-500 uppercase";
const DETAILS_SUMMARY = "cursor-pointer text-xs text-ink-500 select-none hover:text-ink-700";

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

  return (
    <div className="flex flex-col gap-5">
      {error && <Alert variant="danger">{error}</Alert>}

      {result?.ok && <ImportOutcome result={result} />}

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
        <PlanPreview
          plan={plan}
          pending={pending}
          onConfirm={confirm}
          onReset={() => {
            setPlan(null);
            setError(null);
          }}
        />
      )}
    </div>
  );
}

function ImportOutcome({ result }: { result: Extract<ExecuteImportResult, { ok: true }> }) {
  const created = result.rundowns.filter((rundown) => rundown.skippedReason === null).length;
  return (
    <div className="rounded border border-line bg-panel-50 p-4">
      <h2 className="text-sm font-bold text-ink-900">Import complete</h2>
      <p className="mt-1 text-sm text-ink-700">
        {plural(created, "rundown")} created · {plural(result.copyCreated, "new copy record")} (
        {plural(result.underwritersCreated, "new underwriter")}) · {result.copyReused} reused from
        the library
        {result.copyUpdated > 0 &&
          `, ${result.copyUpdated} of them updated to the export's wording`}
        .
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
  );
}

function PlanPreview({
  plan,
  pending,
  onConfirm,
  onReset,
}: {
  plan: ProgramLogPlan;
  pending: boolean;
  onConfirm: () => void;
  onReset: () => void;
}) {
  const creatable = plan.rundowns.filter((rundown) => rundown.existingRundownId === null);
  const skipped = plan.rundowns.length - creatable.length;
  const itemCount = creatable.reduce(
    (sum, rundown) => sum + rundown.breaks.reduce((inner, brk) => inner + brk.items.length, 0),
    0,
  );
  const newCopy = plan.copyPlans.filter((copy) => copy.existingCopyId === null);
  const newUnderwriters = newCopy.filter((copy) => copy.underwriterIsNew);
  const updatedCopy = plan.copyPlans.filter(
    (copy) => copy.existingCopyId !== null && copy.scriptChanged,
  );
  const unchangedCopy = plan.copyPlans.filter(
    (copy) => copy.existingCopyId !== null && !copy.scriptChanged,
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-bold text-ink-900">{plan.airDate || "Unknown date"}</h2>
        <Button type="button" onClick={onConfirm} disabled={pending || creatable.length === 0}>
          {pending ? "Importing…" : `Import ${plural(creatable.length, "rundown")}`}
        </Button>
        <Button type="button" variant="secondary" onClick={onReset} disabled={pending}>
          Start over
        </Button>
      </div>

      {/* The whole review at a glance; each figure is expanded below. */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded border border-line bg-panel-50 px-4 py-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Rundowns"
          value={creatable.length}
          note={skipped > 0 ? `${skipped} already exist` : null}
        />
        <Stat label="Items placed" value={itemCount} />
        <Stat
          label="New underwriters"
          value={newUnderwriters.length}
          tone={newUnderwriters.length > 0 ? "success" : null}
        />
        <Stat
          label="New copy"
          value={newCopy.length - newUnderwriters.length}
          tone={newCopy.length > newUnderwriters.length ? "success" : null}
        />
        <Stat
          label="Library scripts updated"
          value={updatedCopy.length}
          tone={updatedCopy.length > 0 ? "warning" : null}
        />
        <Stat
          label="Unresolved"
          value={plan.unresolved.length}
          tone={plan.unresolved.length > 0 ? "danger" : null}
        />
      </dl>

      {plan.warnings.length > 0 && (
        <Alert variant="note">
          <ul className="list-disc pl-4">
            {plan.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Alert>
      )}

      {plan.unresolved.length > 0 && (
        <section className="rounded border border-line">
          <h3 className={SECTION_HEADING}>Not imported</h3>
          <ul className="divide-y divide-line">
            {plan.unresolved.map((row) => (
              <li key={`${row.time}-${row.description}`} className="px-4 py-2 text-xs text-ink-700">
                <span className="font-mono">{row.time}</span>{" "}
                <span className="font-semibold">{row.description}</span>{" "}
                <span className="text-ink-500">— {row.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded border border-line">
        <h3 className={SECTION_HEADING}>Rundowns</h3>
        <ul className="divide-y divide-line">
          {plan.rundowns.map((rundown) => (
            <RundownPreview key={rundown.programId} rundown={rundown} />
          ))}
          {plan.rundowns.length === 0 && (
            <li className="px-4 py-2.5 text-sm text-ink-500">No rundowns could be planned.</li>
          )}
        </ul>
      </section>

      <section className="rounded border border-line">
        <h3 className={SECTION_HEADING}>Underwriting credits</h3>
        <ul className="divide-y divide-line">
          {newCopy.map((copy) => (
            <li key={copy.key} className="px-4 py-2.5">
              <CopyHeading copy={copy}>
                <Badge variant="success">
                  {copy.underwriterIsNew ? "new underwriter" : "new copy"}
                </Badge>
              </CopyHeading>
              {/* This text becomes library copy other days reuse — shown whole. */}
              {copy.script !== null && (
                <p className="mt-1 text-xs whitespace-pre-wrap text-ink-700">{copy.script}</p>
              )}
            </li>
          ))}
          {updatedCopy.map((copy) => (
            <li key={copy.key} className="px-4 py-2.5">
              <CopyHeading copy={copy}>
                <Badge variant="warning">library script will be updated</Badge>
              </CopyHeading>
              <div className="mt-1.5 grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <div className="mb-0.5 font-semibold text-ink-500">Library now</div>
                  <p className="whitespace-pre-wrap text-ink-500 line-through decoration-ink-300">
                    {copy.libraryScript}
                  </p>
                </div>
                <div>
                  <div className="mb-0.5 font-semibold text-ink-500">From this export</div>
                  <p className="whitespace-pre-wrap text-ink-700">{copy.script}</p>
                </div>
              </div>
            </li>
          ))}
          {unchangedCopy.length > 0 && (
            <li className="px-4 py-2.5">
              <details>
                <summary className={DETAILS_SUMMARY}>
                  {plural(unchangedCopy.length, "credit")} reuse library copy unchanged
                </summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {unchangedCopy.map((copy) => (
                    <li key={copy.key}>
                      <CopyHeading copy={copy} />
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          )}
          {plan.copyPlans.length === 0 && (
            <li className="px-4 py-2.5 text-sm text-ink-500">
              No scheduled credits with scripts appear in this export.
            </li>
          )}
        </ul>
      </section>

      {plan.notes.length > 0 && (
        <details className="rounded border border-line px-4 py-2.5">
          <summary className={DETAILS_SUMMARY}>
            {plural(plan.notes.length, "operational note")} not imported
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {plan.notes.map((note) => (
              <li key={`${note.time}-${note.description}`} className="text-xs text-ink-500">
                <span className="font-mono">{note.time}</span> {note.description}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number;
  note?: string | null;
  tone?: "success" | "warning" | "danger" | null;
}) {
  const valueClass =
    tone === "danger"
      ? "text-danger"
      : tone === "warning"
        ? "text-warning-fg"
        : tone === "success"
          ? "text-success-fg"
          : "text-ink-900";
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className={cn("text-lg font-bold", valueClass)}>
        {value}
        {note && <span className="ml-1.5 text-xs font-normal text-ink-500">{note}</span>}
      </dd>
    </div>
  );
}

function RundownPreview({ rundown }: { rundown: RundownPlan }) {
  const filled = rundown.breaks.filter((brk) => brk.items.length > 0);
  const empty = rundown.breaks.filter((brk) => brk.items.length === 0);
  const itemCount = filled.reduce((sum, brk) => sum + brk.items.length, 0);
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-ink-900">{rundown.programName}</span>
        <span className="text-xs text-ink-500">
          {rundown.shiftStartTime.slice(0, 5)} · {rundown.shiftDurationMinutes} min ·{" "}
          {plural(itemCount, "item")} in {plural(filled.length, "break")}
        </span>
        {rundown.existingRundownId !== null && (
          <Badge variant="warning">already exists — will be skipped</Badge>
        )}
      </div>
      {filled.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {filled.map((brk) => (
            <BreakPreview key={`${brk.time}-${brk.label}`} brk={brk} />
          ))}
        </ul>
      )}
      {empty.length > 0 && (
        <details className="mt-1.5">
          <summary className={DETAILS_SUMMARY}>
            {plural(empty.length, "open clock opportunity", "open clock opportunities")}
          </summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {empty.map((brk) => (
              <li
                key={`${brk.time}-${brk.label}`}
                className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-500"
              >
                <span className="font-mono">{brk.time}</span>
                <span>{brk.label}</span>
                <span>{formatSeconds(brk.availableDurationSeconds)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function BreakPreview({ brk }: { brk: BreakPlan }) {
  const exportTimes = (brk.placement?.exportTimes ?? []).filter((time) => time !== brk.time);
  return (
    <li className="text-xs">
      <div className="flex flex-wrap items-baseline gap-x-2 text-ink-700">
        <span className="font-mono">{brk.time}</span>
        <span className="font-semibold">{brk.label}</span>
        <span className="text-ink-500">{formatSeconds(brk.availableDurationSeconds)} window</span>
        {exportTimes.length > 0 && (
          <span className="text-ink-500">export printed {exportTimes.join(", ")}</span>
        )}
        {brk.placement?.source === "clock_slot" && (
          <Badge>clock slot, not a marked opportunity</Badge>
        )}
        {brk.placement?.source === "export" && (
          <Badge variant="warning">no clock slot here — export&apos;s own window</Badge>
        )}
      </div>
      <ul className="mt-0.5 ml-4 flex flex-col gap-0.5 border-l border-line pl-3">
        {brk.items.map((item, index) => (
          <li key={index} className="flex flex-wrap items-baseline gap-x-2 text-ink-700">
            <Badge>{itemKindLabel(item)}</Badge>
            <span>{item.title}</span>
            <span className="text-ink-500">{formatSeconds(item.durationSeconds)}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

function CopyHeading({ copy, children }: { copy: CopyPlan; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-sm font-semibold text-ink-900">{copy.underwriterName}</span>
      <span className="text-xs text-ink-500">
        {copy.label}
        {copy.cart !== null && ` · cart ${copy.cart}`}
        {copy.durationSeconds !== null && ` · ${formatSeconds(copy.durationSeconds)}`}
        {` · airs ${copy.airings}×`}
      </span>
      {children}
    </div>
  );
}
