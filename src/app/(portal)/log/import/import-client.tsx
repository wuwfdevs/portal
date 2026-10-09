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
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { BusyPanel } from "@/components/ui/busy-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileInput } from "@/components/ui/input";
import { TextLink } from "@/components/ui/primary-link";
import { StatTile } from "@/components/ui/stat-tile";
import { Steps } from "@/components/ui/steps";
import { cn } from "@/lib/cn";
import { formatStationDateLong } from "@/lib/log/timezone";
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
import {
  formatBytes as formatFileSize,
  formatClock as formatSeconds,
  pluralize,
} from "@/lib/format";
import { actionFailureMessage } from "@/lib/use-action";

const IMPORT_STEPS = [{ label: "Upload" }, { label: "Review" }, { label: "Confirm" }];

function itemKindLabel(item: ItemPlan): string {
  if (item.kind === "credit") return "credit";
  if (item.kind === "content") return "library";
  return "live read";
}

const SECTION_HEADING =
  "border-b border-line bg-panel-50 px-4 py-2 text-xs font-bold tracking-wide text-ink-500 uppercase";
const DETAILS_SUMMARY = "cursor-pointer text-xs text-ink-500 select-none hover:text-ink-700";

export function ImportClient({ fromDate }: { fromDate: string | null }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [plan, setPlan] = useState<ProgramLogPlan | null>(null);
  const [result, setResult] = useState<ExecuteImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const upload = () => {
    const chosen = fileInputRef.current?.files?.[0];
    if (!chosen) {
      setError("Choose a program-log export (.pdf) first.");
      return;
    }
    const formData = new FormData();
    formData.set("file", chosen);
    setFile({ name: chosen.name, size: chosen.size });
    startTransition(async () => {
      setError(null);
      setResult(null);
      try {
        const response = await parseProgramLogUpload(formData);
        if (response.ok) setPlan(response.plan);
        else setError(response.error);
      } catch (caught) {
        setError(actionFailureMessage(caught));
      }
    });
  };

  const confirm = () => {
    if (!plan) return;
    startTransition(async () => {
      setError(null);
      try {
        const response = await executeProgramLogImport(JSON.stringify(plan));
        if (response.ok) {
          const created = response.rundowns.filter((rundown) => rundown.skippedReason === null);
          // A clean import lands back on Today at the log's own date, which is
          // where the rundowns now show. One with a skipped rundown stays here:
          // the per-rundown reasons are what the host needs to read next.
          if (created.length === response.rundowns.length && created.length > 0) {
            router.push(
              `/log?date=${plan.airDate}&imported=${created.length}&unresolved=${plan.unresolved.length}`,
            );
            return;
          }
          setResult(response);
          setPlan(null);
        } else {
          setError(response.error);
        }
      } catch (caught) {
        setError(actionFailureMessage(caught));
      }
    });
  };

  // Upload while the file is being read, Review once there is a plan,
  // Confirm while it is being written; every step done after a result.
  const reading = pending && !plan;
  const writing = pending && plan !== null;
  const currentStep = result?.ok ? IMPORT_STEPS.length : plan ? (writing ? 2 : 1) : 0;

  return (
    <div className="flex flex-col gap-5">
      <Steps
        label="Import steps"
        steps={IMPORT_STEPS}
        current={currentStep}
        busy={pending}
        busyNote={reading ? "reading the file" : writing ? "creating rundowns" : undefined}
      />

      {error && <Alert variant="danger">{error}</Alert>}

      {result?.ok && <ImportOutcome result={result} fromDate={fromDate} />}

      {/* Kept mounted (only hidden) while the file is read, so a failed read
          leaves the chosen file in the input. */}
      {!plan && (
        <div
          className={cn(
            "flex flex-col items-start gap-3 rounded border border-line p-4",
            reading && "hidden",
          )}
        >
          <FileInput
            ref={fileInputRef}
            accept=".pdf,application/pdf"
            className="max-w-md"
            aria-label="Program-log export file"
          />
          <Button type="button" onClick={upload} disabled={pending}>
            {pending ? "Reading…" : "Preview import"}
          </Button>
        </div>
      )}

      {reading && (
        <>
          {file && (
            <div className="flex items-center gap-3 rounded border border-line bg-panel-50 px-4 py-3 text-sm">
              <span className="min-w-0 flex-1 truncate font-semibold text-ink-900">
                {file.name}
              </span>
              <span className="shrink-0 text-xs text-ink-500">{formatFileSize(file.size)}</span>
            </div>
          )}
          <BusyPanel
            title="Reading the log"
            hint="This can take a minute"
            note="Nothing is written yet. Keep this page open while it works."
          />
        </>
      )}

      {writing && (
        <BusyPanel
          title="Importing rundowns"
          hint="This can take a moment"
          note="The import runs as one step. Keep this page open until it finishes."
        />
      )}

      {plan && (
        <PlanPreview
          plan={plan}
          fromDate={fromDate}
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

function ImportOutcome({
  result,
  fromDate,
}: {
  result: Extract<ExecuteImportResult, { ok: true }>;
  fromDate: string | null;
}) {
  const created = result.rundowns.filter((rundown) => rundown.skippedReason === null).length;
  return (
    <Card className="bg-panel-50 p-4">
      <h2 className="text-sm font-bold text-ink-900">Import complete</h2>
      <p className="mt-1 text-sm text-ink-700">
        {pluralize(created, "rundown")} created · {pluralize(result.copyCreated, "new copy record")}{" "}
        ({pluralize(result.underwritersCreated, "new underwriter")}) · {result.copyReused} reused
        from the library
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
      <p className="mt-3 text-sm">
        <TextLink href={fromDate ? `/log?date=${fromDate}` : "/log"} className="px-0">
          Back to Today →
        </TextLink>
      </p>
    </Card>
  );
}

function PlanPreview({
  plan,
  fromDate,
  pending,
  onConfirm,
  onReset,
}: {
  plan: ProgramLogPlan;
  fromDate: string | null;
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
      {plan.airDate && fromDate && plan.airDate !== fromDate && (
        <Alert variant="warning">
          <strong className="text-sm">
            This log is dated {formatStationDateLong(plan.airDate)}.
          </strong>{" "}
          You started from {formatStationDateLong(fromDate)}. Confirming creates rundowns for{" "}
          {formatStationDateLong(plan.airDate)}, and you will land on that day.
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-bold text-ink-900">
          {plan.airDate ? formatStationDateLong(plan.airDate) : "Unknown date"}
        </h2>
        <Button type="button" onClick={onConfirm} disabled={pending || creatable.length === 0}>
          {pending
            ? "Importing…"
            : `Import ${pluralize(creatable.length, "rundown")}${plan.airDate ? ` for ${plan.airDate}` : ""}`}
        </Button>
        <Button type="button" variant="secondary" onClick={onReset} disabled={pending}>
          Start over
        </Button>
      </div>

      {/* The whole review at a glance; each figure is expanded below. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Rundowns"
          value={creatable.length}
          hint={skipped > 0 ? `${skipped} already exist` : null}
        />
        <StatTile label="Items placed" value={itemCount} />
        <StatTile
          label="New underwriters"
          value={newUnderwriters.length}
          tone={newUnderwriters.length > 0 ? "success" : "neutral"}
        />
        <StatTile
          label="New copy"
          value={newCopy.length - newUnderwriters.length}
          tone={newCopy.length > newUnderwriters.length ? "success" : "neutral"}
        />
        <StatTile
          label="Library scripts updated"
          value={updatedCopy.length}
          tone={updatedCopy.length > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label="Unresolved"
          value={plan.unresolved.length}
          tone={plan.unresolved.length > 0 ? "danger" : "neutral"}
        />
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

      {plan.unresolved.length > 0 && (
        <Card>
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
        </Card>
      )}

      <Card>
        <h3 className={SECTION_HEADING}>Rundowns</h3>
        <ul className="divide-y divide-line">
          {plan.rundowns.map((rundown) => (
            <RundownPreview key={rundown.programId} rundown={rundown} />
          ))}
          {plan.rundowns.length === 0 && (
            <li className="px-4 py-2.5 text-sm text-ink-500">No rundowns could be planned.</li>
          )}
        </ul>
      </Card>

      <Card>
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
                  {pluralize(unchangedCopy.length, "credit")} reuse library copy unchanged
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
      </Card>

      {plan.notes.length > 0 && (
        <details className="rounded border border-line px-4 py-2.5">
          <summary className={DETAILS_SUMMARY}>
            {pluralize(plan.notes.length, "operational note")} not imported
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
          {pluralize(itemCount, "item")} in {pluralize(filled.length, "break")}
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
            {pluralize(empty.length, "open clock opportunity", "open clock opportunities")}
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
