"use client";

// Seeding active copy from RadioTraffic (docs/underwriting-traffic-
// redesign.md §15). The whole review happens here, in the browser, with the
// same pure planner the import action runs: the file is parsed and matched
// against the snapshot the page loaded, and every answer re-plans at once.
// Nothing is written until "Import"; the action then recomputes the plan
// from the same file and answers against a fresh read.
//
// The screen leads with questions, not rows: most of an export needs no
// decision, so it folds into one line, and each decision is one card with a
// plain question and a few choices. A choice that is safe to recommend is
// preselected and shown folded, so it still reads as a decision.

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { BusyPanel } from "@/components/ui/busy-panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Steps } from "@/components/ui/steps";
import { cn } from "@/lib/cn";
import {
  SKIP,
  formatSourceDates,
  parseLegacyCopyCsv,
  planLegacyCopyImport,
  type LegacyCopyAnswers,
  type LegacyCopyPlan,
  type LegacyCopyQuestion,
  type LegacyCopySnapshot,
  type ParsedLegacyCopy,
  type PlannedCopy,
} from "@/lib/underwriting/legacy-copy";
import type { LegacyCopyImportResult } from "@/lib/underwriting/legacy-copy-import";
import { importLegacyCopy } from "./actions";

const MAX_FILE_BYTES = 1024 * 1024;
const STEPS = [{ label: "Choose the export" }, { label: "Review" }, { label: "Import" }];
const SECONDARY_LINK =
  "inline-flex h-10 items-center whitespace-nowrap rounded border border-brand-link px-4 text-sm font-bold text-brand-link hover:bg-brand-surface";

/**
 * The answers the plan runs on: the person's own, plus the recommended
 * choice for any question they haven't touched. Planned twice because an
 * answer can raise a new question (a new underwriter's contract).
 */
function planWithDefaults(
  parsed: ParsedLegacyCopy,
  snapshot: LegacyCopySnapshot,
  answers: LegacyCopyAnswers,
): { plan: LegacyCopyPlan; effective: LegacyCopyAnswers; defaulted: Set<string> } {
  let effective = { ...answers };
  const defaulted = new Set<string>();
  let plan = planLegacyCopyImport(parsed.rows, snapshot, effective);
  for (let pass = 0; pass < 3; pass++) {
    const additions = plan.questions.filter(
      (question) => question.recommended !== null && effective[question.key] === undefined,
    );
    if (additions.length === 0) break;
    for (const question of additions) {
      effective = { ...effective, [question.key]: question.recommended! };
      defaulted.add(question.key);
    }
    plan = planLegacyCopyImport(parsed.rows, snapshot, effective);
  }
  return { plan, effective, defaulted };
}

function answerLabel(
  question: LegacyCopyQuestion,
  value: string,
  underwriterNames: Map<string, string>,
) {
  const option = question.options.find((entry) => entry.value === value);
  if (option) return option.label;
  if (value.startsWith("id:"))
    return `Matched to ${underwriterNames.get(value.slice(3)) ?? "an underwriter on file"}`;
  return value;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function CopyImportClient({ snapshot }: { snapshot: LegacyCopySnapshot }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedLegacyCopy | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<LegacyCopyAnswers>({});
  const [reopened, setReopened] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<LegacyCopyImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const underwriterNames = useMemo(
    () => new Map(snapshot.underwriters.map((entry) => [entry.id, entry.name])),
    [snapshot],
  );
  const planned = useMemo(
    () => (parsed ? planWithDefaults(parsed, snapshot, answers) : null),
    [parsed, snapshot, answers],
  );

  const onFile = async (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return setFileError("That file is over 1 MB.");
    if (/\.xlsx?$/i.test(file.name))
      return setFileError(
        "That’s the Excel workbook. Save it as CSV first (File › Save As › CSV).",
      );
    const content = await file.text();
    const next = parseLegacyCopyCsv(content);
    if (next.rows.length === 0)
      return setFileError(next.errors[0]?.message ?? "No rows in that file.");
    setText(content);
    setFileName(file.name);
    setParsed(next);
    setAnswers({});
    setReopened(new Set());
    setResult(null);
    setImportError(null);
  };

  const answer = (key: string, value: string) => {
    setAnswers((previous) => ({ ...previous, [key]: value }));
    setReopened((previous) => {
      const next = new Set(previous);
      next.delete(key);
      return next;
    });
  };

  const runImport = () => {
    if (!planned || !fileName) return;
    setImportError(null);
    startTransition(async () => {
      const response = await importLegacyCopy({
        csv: text,
        answers: JSON.stringify(planned.effective),
        fileName,
      });
      if (response.ok) setResult(response.data);
      else setImportError(response.error);
    });
  };

  const reset = () => {
    setParsed(null);
    setFileName(null);
    setText("");
    setAnswers({});
    setResult(null);
    setImportError(null);
  };

  const current = result ? 3 : pending ? 2 : parsed ? 1 : 0;

  return (
    <div className="flex flex-col gap-6 pb-24">
      <Steps
        steps={STEPS}
        current={current}
        busy={pending}
        busyNote="writing copy"
        label="Import steps"
      />

      {result ? (
        <ImportResult
          result={result}
          plan={planned?.plan ?? null}
          fileName={fileName}
          onAgain={reset}
        />
      ) : pending ? (
        <BusyPanel
          title="Importing copy"
          hint="Usually under a minute"
          note="Each message is written on its own; if anything fails, the rest still land and running this again finishes the job."
        />
      ) : !parsed || !planned ? (
        <ChooseFile onFile={onFile} fileError={fileError} />
      ) : (
        <Review
          fileName={fileName!}
          parsed={parsed}
          plan={planned.plan}
          answers={planned.effective}
          defaulted={planned.defaulted}
          touched={answers}
          reopened={reopened}
          onReopen={(key) => setReopened((previous) => new Set(previous).add(key))}
          onAnswer={answer}
          onChooseAnother={reset}
          underwriters={snapshot.underwriters}
          underwriterNames={underwriterNames}
          importError={importError}
          onImport={runImport}
        />
      )}
    </div>
  );
}

function ChooseFile({
  onFile,
  fileError,
}: {
  onFile: (file: File | undefined) => void;
  fileError: string | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <div className="flex flex-col gap-3 lg:col-span-7">
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded border-2 border-dashed border-[#9FB7CA] bg-[#F7FAFC] px-6 py-10 text-center hover:border-brand-primary">
          <span className="text-[15px] font-bold text-ink-900">
            Choose the RadioTraffic copy export (CSV)
          </span>
          <span className="text-[13px] text-ink-500">
            Up to 1 MB. Nothing is written until you confirm on the next step.
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => onFile(event.target.files?.[0])}
          />
        </label>
        {fileError && <p className="text-sm text-danger">{fileError}</p>}
      </div>
      <aside className="flex flex-col gap-3 rounded border border-line px-5 py-4 text-sm text-ink-700 lg:col-span-5">
        <h3 className="text-[15px] font-bold text-ink-900">Getting the file</h3>
        <p>
          Open the “Active Copy by Underwriter” workbook and use{" "}
          <strong>File › Save As › CSV</strong>. Title lines above the header row are fine.
        </p>
        <p>
          Columns are found by name: Underwriter, Copy Name (or Label), Cart, Length, Start Date,
          End Date, and Script.
        </p>
        <p className="text-ink-500">
          Running the same export again is safe: copy already in the portal is recognised by its
          script and skipped.
        </p>
      </aside>
    </div>
  );
}

function Review({
  fileName,
  parsed,
  plan,
  answers,
  defaulted,
  touched,
  reopened,
  onReopen,
  onAnswer,
  onChooseAnother,
  underwriters,
  underwriterNames,
  importError,
  onImport,
}: {
  fileName: string;
  parsed: ParsedLegacyCopy;
  plan: LegacyCopyPlan;
  answers: LegacyCopyAnswers;
  defaulted: Set<string>;
  touched: LegacyCopyAnswers;
  reopened: Set<string>;
  onReopen: (key: string) => void;
  onAnswer: (key: string, value: string) => void;
  onChooseAnother: () => void;
  underwriters: { id: string; name: string }[];
  underwriterNames: Map<string, string>;
  importError: string | null;
  onImport: () => void;
}) {
  const open = plan.questions.filter((question) => answers[question.key] === undefined);
  const { counts } = plan;
  const headline =
    open.length === 0
      ? counts.ready > 0
        ? "Everything is answered. Ready to import."
        : "Nothing new to import."
      : `Most of this export can come in as is. ${open.length === 1 ? "One thing needs" : `${open.length} things need`} you first.`;
  const readyCopies = plan.copies.filter(
    (copy) => copy.status === "ready" || copy.status === "done",
  );
  const leftOut = plan.copies.filter((copy) => copy.status === "excluded");

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <div className="flex flex-col gap-8 lg:col-span-8">
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] text-ink-500">
            {fileName} · {plural(counts.rows, "row")} ·{" "}
            <button type="button" onClick={onChooseAnother} className="font-bold text-brand-link">
              Choose another file
            </button>
          </p>
          <h3 className="font-serif text-2xl font-bold text-ink-900">{headline}</h3>
        </div>

        {parsed.errors.length > 0 && (
          <Alert variant="warning">
            {plural(parsed.errors.length, "row")} couldn’t be read and will be skipped:{" "}
            {parsed.errors
              .slice(0, 5)
              .map((error) => (error.row ? `row ${error.row}: ${error.message}` : error.message))
              .join(" · ")}
            {parsed.errors.length > 5 && ` · and ${parsed.errors.length - 5} more`}
          </Alert>
        )}

        {plan.questions.length > 0 && (
          <section aria-labelledby="questions-heading" className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h4 id="questions-heading" className="text-base font-bold text-ink-900">
                Questions
              </h4>
              <span className="text-[13px] text-ink-500">
                {plan.questions.length - open.length} of {plan.questions.length} answered
              </span>
            </div>
            {[...plan.questions]
              .sort((a, b) => Number(a.recommended !== null) - Number(b.recommended !== null))
              .map((question) => (
                <QuestionCard
                  key={question.key}
                  question={question}
                  value={answers[question.key]}
                  recommendedDefault={
                    defaulted.has(question.key) && touched[question.key] === undefined
                  }
                  open={answers[question.key] === undefined || reopened.has(question.key)}
                  onReopen={() => onReopen(question.key)}
                  onAnswer={(value) => onAnswer(question.key, value)}
                  underwriters={underwriters}
                  underwriterNames={underwriterNames}
                />
              ))}
          </section>
        )}

        <section aria-labelledby="automatic-heading" className="flex flex-col gap-2.5">
          <h4 id="automatic-heading" className="text-base font-bold text-ink-900">
            Coming in
          </h4>
          <details className="group rounded border border-line">
            <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3.5 text-[15px]">
              <strong>{plural(counts.ready, "row")}</strong>
              <span className="text-ink-700">
                {[
                  counts.create > 0 && `${counts.create} new copy`,
                  counts.reuse > 0 &&
                    `${counts.reuse} already in the portal${counts.updated > 0 ? ` (${counts.updated} updated)` : ""}`,
                  counts.linksToCreate > 0 && plural(counts.linksToCreate, "contract link"),
                  counts.underwriterOnly > 0 && `${counts.underwriterOnly} underwriter only`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Nothing yet"}
              </span>
              <span className="ml-auto font-bold text-brand-link group-open:hidden">Show all</span>
              <span className="ml-auto hidden font-bold text-brand-link group-open:inline">
                Hide
              </span>
            </summary>
            <CopyList copies={readyCopies} />
          </details>
          {counts.done > 0 && (
            <p className="text-[13px] text-ink-500">
              {plural(counts.done, "row")} already in the portal exactly as exported; nothing to
              write for them.
            </p>
          )}
        </section>

        {leftOut.length > 0 && (
          <section aria-labelledby="left-out-heading" className="flex flex-col gap-2.5">
            <h4 id="left-out-heading" className="text-base font-bold text-ink-900">
              Staying out
            </h4>
            <details className="group rounded border border-line">
              <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3.5 text-[15px]">
                <strong>{plural(counts.excluded, "row")}</strong>
                <span className="text-ink-700">
                  {[
                    counts.placeholders > 0 &&
                      `${plural(counts.placeholders, "placeholder")} with no script yet`,
                    counts.notCopy > 0 && `${counts.notCopy} not underwriting copy`,
                    counts.skipped > 0 && `${counts.skipped} left out by your answers`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="ml-auto font-bold text-brand-link group-open:hidden">Show</span>
                <span className="ml-auto hidden font-bold text-brand-link group-open:inline">
                  Hide
                </span>
              </summary>
              <CopyList copies={leftOut} />
            </details>
          </section>
        )}
      </div>

      <aside className="flex flex-col gap-3 self-start rounded border border-line px-5 py-4 text-sm text-ink-700 lg:col-span-4">
        <h4 className="text-[15px] font-bold text-ink-900">How rows are matched</h4>
        <p>
          Copy already in the portal is found by its script, so nothing is duplicated. Its wording
          only changes where a question says so.
        </p>
        <p>
          A contract is linked only when exactly one agreement fits the copy’s dates and product.
          Linked copy joins that contract’s rotation.
        </p>
        <p className="text-ink-500">
          Nothing is written until you import. Running this again skips what’s already here.
        </p>
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-8">
          <p className="text-sm">
            <strong>{plural(counts.ready, "row")} will import.</strong>{" "}
            <span className="text-ink-500">
              {open.length > 0
                ? `${plural(counts.waiting, "row")} waiting on ${open.length === 1 ? "a question" : "questions"}, left out until answered.`
                : counts.waiting > 0
                  ? `${plural(counts.waiting, "row")} still waiting.`
                  : "Everything else is already here or staying out."}
            </span>
          </p>
          {importError && <p className="text-sm text-danger">{importError}</p>}
          <span className="flex-1" />
          <Button type="button" onClick={onImport} disabled={counts.ready === 0}>
            Import {plural(counts.ready, "row")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function QuestionCard({
  question,
  value,
  recommendedDefault,
  open,
  onReopen,
  onAnswer,
  underwriters,
  underwriterNames,
}: {
  question: LegacyCopyQuestion;
  value: string | undefined;
  recommendedDefault: boolean;
  open: boolean;
  onReopen: () => void;
  onAnswer: (value: string) => void;
  underwriters: { id: string; name: string }[];
  underwriterNames: Map<string, string>;
}) {
  const [picking, setPicking] = useState(value?.startsWith("id:") ?? false);
  const kindLabel = {
    underwriter: "New underwriter",
    contract: "Which contract",
    flight: "Which flight",
    script: "Changed wording",
  }[question.kind];

  if (!open && value !== undefined)
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-line px-5 py-3">
        <span aria-hidden="true" className="text-success-fg">
          ✓
        </span>
        <span className="text-xs font-bold uppercase tracking-wide text-ink-500">{kindLabel}</span>
        <span className="text-[15px] font-semibold text-ink-900">{question.subject}</span>
        <span className="text-sm text-ink-500">
          {answerLabel(question, value, underwriterNames)}
          {recommendedDefault && " (recommended)"}
        </span>
        <span className="flex-1" />
        <button type="button" onClick={onReopen} className="p-2 text-sm font-bold text-brand-link">
          Change
        </button>
      </div>
    );

  const name = `q-${question.key}`;
  const renderOption = (option: LegacyCopyQuestion["options"][number]) => {
    const checked = value === option.value && !picking;
    return (
      <label
        key={option.value}
        className={cn(
          "flex min-h-11 cursor-pointer items-start gap-2.5 rounded border px-3 py-2.5",
          checked
            ? "border-brand-primary bg-brand-surface/60"
            : "border-line hover:border-brand-primary",
        )}
      >
        <input
          type="radio"
          name={name}
          className="mt-0.5 h-[18px] w-[18px] shrink-0"
          checked={checked}
          onChange={() => {
            setPicking(false);
            onAnswer(option.value);
          }}
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-ink-900">
            {option.label}
            {question.recommended === option.value && (
              <Badge variant="accent" className="ml-2 align-middle">
                Recommended
              </Badge>
            )}
          </span>
          <span className="text-[13px] text-ink-500">{option.hint}</span>
        </span>
      </label>
    );
  };
  return (
    <fieldset className="flex flex-col gap-3.5 rounded border border-warning-border bg-white px-5 py-4">
      <legend className="sr-only">{question.question}</legend>
      <div className="flex flex-col gap-1" aria-hidden="true">
        <span className="text-xs font-bold uppercase tracking-wide text-warning-fg">
          {kindLabel}
        </span>
        <span className="text-[17px] font-bold text-ink-900">{question.question}</span>
      </div>
      <p className="text-sm text-ink-700">
        {question.context}{" "}
        {question.rowCount > 1 && (
          <span className="text-ink-500">Covers {question.rowCount} rows.</span>
        )}
      </p>
      <div className="flex flex-col gap-2">
        {question.options.filter((option) => option.value !== SKIP).map(renderOption)}
        {question.choosesUnderwriter && (
          <div
            className={cn(
              "flex flex-col gap-2 rounded border px-3 py-2.5",
              picking ? "border-brand-primary bg-brand-surface/60" : "border-line",
            )}
          >
            <label className="flex min-h-7 cursor-pointer items-start gap-2.5">
              <input
                type="radio"
                name={name}
                className="mt-0.5 h-[18px] w-[18px] shrink-0"
                checked={picking}
                onChange={() => setPicking(true)}
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold text-ink-900">
                  It’s an underwriter already on file
                </span>
                <span className="text-[13px] text-ink-500">Its copy is added under that name</span>
              </span>
            </label>
            {picking && (
              <div className="flex flex-col gap-1.5 pl-7">
                <Label htmlFor={`${name}-picker`}>Underwriter</Label>
                <SearchableSelect
                  id={`${name}-picker`}
                  name={`${name}-picker`}
                  options={underwriters.map((entry) => ({ id: entry.id, label: entry.name }))}
                  value={value?.startsWith("id:") ? value.slice(3) : undefined}
                  onChange={(id) => id && onAnswer(`id:${id}`)}
                  placeholder="Type a name…"
                />
              </div>
            )}
          </div>
        )}
        {question.options.filter((option) => option.value === SKIP).map(renderOption)}
      </div>
      {question.comparisons && question.comparisons.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-bold text-brand-link">
            Compare the wording
            {question.comparisons.length > 1 ? ` (${question.comparisons.length})` : ""}
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            {question.comparisons.map((comparison) => (
              <div
                key={`${comparison.label}-${comparison.incomingDates}`}
                className="flex flex-col gap-2"
              >
                <span className="font-semibold text-ink-900">{comparison.label}</span>
                <div className="grid grid-cols-1 gap-4 leading-relaxed text-ink-700 md:grid-cols-2">
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-wide text-ink-500">
                      In the portal
                    </span>
                    <p className="whitespace-pre-line">{comparison.portal}</p>
                  </div>
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-wide text-ink-500">
                      In RadioTraffic · {comparison.incomingDates}
                    </span>
                    <p className="whitespace-pre-line">{comparison.incoming}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </fieldset>
  );
}

function describeCopy(copy: PlannedCopy): string {
  if (copy.status === "waiting") return "Waiting on a question that wasn’t answered";
  if (copy.status === "excluded")
    return copy.excludedReason === "placeholder"
      ? "Placeholder — no script in RadioTraffic yet"
      : copy.excludedReason === "not_copy"
        ? "Not underwriting copy"
        : "Left out by your answer";
  const parts: string[] = [];
  if (copy.copy.action === "create")
    parts.push(copy.executionKind === "recorded" ? "New recorded spot" : "New live read");
  if (copy.copy.action === "reuse")
    parts.push(
      copy.copy.changes.length > 0 ? copy.copy.changes.join("; ") : "Already in the portal",
    );
  for (const link of copy.links)
    parts.push(
      `${link.exists ? "Linked to" : "Links to"} ${link.contractLabel}${link.flightName ? `, ${link.flightName} flight` : ""}`,
    );
  if (copy.links.length === 0 && copy.unlinkedReason)
    parts.push(`Underwriter only: ${copy.unlinkedReason.toLowerCase()}`);
  return parts.join(" · ");
}

function CopyList({ copies }: { copies: PlannedCopy[] }) {
  if (copies.length === 0)
    return <p className="border-t border-line px-5 py-3 text-sm text-ink-500">None.</p>;
  const byUnderwriter = new Map<string, PlannedCopy[]>();
  for (const copy of copies) {
    const name =
      copy.underwriter.kind === "unresolved" ? copy.sourceUnderwriter : copy.underwriter.name;
    byUnderwriter.set(name, [...(byUnderwriter.get(name) ?? []), copy]);
  }
  return (
    <ul className="border-t border-line">
      {[...byUnderwriter.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, list]) => {
          const source = list[0]!.sourceUnderwriter;
          return (
            <li key={name} className="border-b border-panel-100 px-5 py-3 last:border-b-0">
              <p className="text-[15px] font-bold text-ink-900">
                {name}
                {source !== name && (
                  <span className="ml-2 text-[13px] font-normal text-ink-500">
                    RadioTraffic: {source}
                  </span>
                )}
              </p>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {list.map((copy) => (
                  <li key={copy.key} className="text-sm">
                    <span className="font-semibold text-ink-900">{copy.label}</span>
                    <span className="text-ink-500">
                      {copy.cart ? ` · cart ${copy.cart}` : ""} ·{" "}
                      {formatSourceDates(copy.startDate, copy.endDate)}
                    </span>
                    <span className="block text-ink-700">{describeCopy(copy)}</span>
                    {copy.notes.map((note) => (
                      <span key={note} className="block text-[13px] text-ink-500">
                        {note}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
    </ul>
  );
}

function ImportResult({
  result,
  plan,
  fileName,
  onAgain,
}: {
  result: LegacyCopyImportResult;
  plan: LegacyCopyPlan | null;
  fileName: string | null;
  onAgain: () => void;
}) {
  const leftOut = (plan?.copies ?? []).filter(
    (copy) => copy.status === "waiting" || copy.status === "excluded",
  );
  const failed = result.rows.filter((row) => row.outcome === "failed");
  const tiles = [
    { title: "Copy created", count: result.created, hint: "Approved, dated from RadioTraffic" },
    { title: "Copy updated", count: result.updated, hint: "Already in the portal" },
    { title: "Linked", count: result.linked, hint: "Joins each contract’s rotation" },
    { title: "Underwriter only", count: result.underwriterOnly, hint: "No agreement to link to" },
    {
      title: "Underwriters added",
      count: result.underwritersAdded.length,
      hint: result.underwritersAdded.join(", ") || "None",
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <Alert variant={failed.length > 0 ? "warning" : "success"} className="text-sm">
        <strong>
          Imported {fileName ?? "the export"}
          {failed.length > 0 ? ` — ${plural(failed.length, "message")} didn’t go through` : ""}.
        </strong>{" "}
        {result.rebalanced.changed > 0
          ? `${plural(result.rebalanced.changed, "scheduled credit")} now carry a different message in rotation.`
          : "Linked copy joins each contract’s rotation when the contract is active."}
      </Alert>

      <section aria-label="What changed" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {tiles.map((tile) => (
          <div
            key={tile.title}
            className="flex flex-col gap-1 rounded border border-line px-4 py-3.5"
          >
            <span className="text-xs font-bold uppercase tracking-wide text-ink-500">
              {tile.title}
            </span>
            <span className="font-serif text-3xl font-bold text-ink-900">{tile.count}</span>
            <span className="text-[13px] text-ink-500">{tile.hint}</span>
          </div>
        ))}
      </section>

      {failed.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-base font-bold text-ink-900">Didn’t go through</h3>
          <ul className="rounded border border-line">
            {failed.map((row) => (
              <li
                key={row.key}
                className="border-b border-panel-100 px-5 py-3 text-sm last:border-b-0"
              >
                <span className="font-semibold">
                  {row.underwriter} · {row.label}
                </span>
                <span className="block text-danger">{row.detail}</span>
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-ink-500">
            Choose the export again to retry these; the rest is recognised and skipped.
          </p>
        </section>
      )}

      {leftOut.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-base font-bold text-ink-900">
            Left out ({leftOut.reduce((sum, copy) => sum + copy.rows.length, 0)})
          </h3>
          <p className="max-w-3xl text-sm text-ink-700">
            Nothing was written for these. Choose the export again to decide the rest; rows already
            imported are recognised and skipped.
          </p>
          <details className="group rounded border border-line">
            <summary className="cursor-pointer px-5 py-3 text-sm font-bold text-brand-link">
              Show the rows
            </summary>
            <CopyList copies={leftOut} />
          </details>
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        <Link
          href="/underwriting/copy"
          className="inline-flex h-10 items-center rounded bg-brand-primary px-4 text-sm font-bold text-white hover:bg-[#2278B8]"
        >
          Open the copy library
        </Link>
        <button type="button" onClick={onAgain} className={SECONDARY_LINK}>
          Review another export
        </button>
      </div>
    </div>
  );
}
