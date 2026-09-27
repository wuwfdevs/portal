"use client";

// "Read the schedule from the agreement" on the schedule step
// (docs/underwriting-traffic-redesign.md §12): one button that sends the
// contract's attached agreement through the model, then a review of what
// it read — each proposed line with what it compiles to and anything to
// look at, the order facts the document adds, and the instructions the
// model couldn't place — with a checkbox per line. Nothing is written
// until "Add the ticked lines"; what lands is then an ordinary draft line
// on the schedule step, editable and removable like any other. The review
// is the check: nothing verifies the model's reading before this screen.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AgreementProposal, ProposedLine } from "@/lib/underwriting/agreement-import";
import {
  applyAgreementProposal,
  proposeScheduleFromAgreement,
} from "../../../agreement-import-actions";

interface Props {
  contractId: string;
  hasAgreement: boolean;
  /** Lines already entered under the revision — shown so a re-read doesn't quietly double them. */
  existingLineCount: number;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function LineRow({
  line,
  checked,
  onToggle,
}: {
  line: ProposedLine;
  checked: boolean;
  onToggle: () => void;
}) {
  const ok = line.compile.ok;
  const stated = line.values.stated_total === "" ? null : Number(line.values.stated_total);
  return (
    <li className="flex items-start gap-3 rounded border border-line px-4 py-3">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0"
        checked={checked}
        disabled={!ok}
        onChange={onToggle}
        aria-label={`Add "${line.values.label || line.description}"`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-ink-900">
            {line.values.label || line.description}
          </span>
          {ok ? (
            stated === null ? (
              <Badge variant="neutral">Compiles to {line.compile.expected}</Badge>
            ) : stated === line.compile.expected ? (
              <Badge variant="success">Matches order · {line.compile.expected}</Badge>
            ) : (
              <Badge variant="warning">
                Order says {stated} · compiles to {line.compile.expected}
              </Badge>
            )
          ) : (
            <Badge variant="danger">Enter by hand</Badge>
          )}
          {line.flightName && <Badge variant="muted">Flight: {line.flightName}</Badge>}
          {line.newFlight && <Badge variant="accent">New flight: {line.newFlight.name}</Badge>}
        </div>
        {ok && (
          <div className="mt-0.5 text-[13px] text-ink-700">
            {line.description} · {line.values.duration_seconds}s
          </div>
        )}
        {line.values.source_text && (
          <blockquote className="mt-1 border-l-2 border-line pl-2 text-[13px] italic text-ink-500">
            {line.values.source_text}
          </blockquote>
        )}
        {!ok && (
          <ul className="mt-1 list-disc pl-5 text-[13px] text-danger">
            {line.compile.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
        {line.warnings.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-[13px] text-warning-fg">
            {line.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export function AgreementImport({ contractId, hasAgreement, existingLineCount }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ proposal: AgreementProposal; revisionId: string } | null>(
    null,
  );
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());
  const [selectedUpdates, setSelectedUpdates] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<string | null>(null);

  function read() {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const outcome = await proposeScheduleFromAgreement(contractId);
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      setResult({ proposal: outcome.proposal, revisionId: outcome.revisionId });
      setSelectedLines(
        new Set(outcome.proposal.lines.filter((line) => line.compile.ok).map((line) => line.index)),
      );
      setSelectedUpdates(new Set(outcome.proposal.orderUpdates.map((update) => update.field)));
    });
  }

  function apply() {
    if (!result) return;
    setError(null);
    startTransition(async () => {
      const lines = result.proposal.lines
        .filter((line) => selectedLines.has(line.index))
        .map((line) => ({ values: line.values, newFlight: line.newFlight }));
      const orderUpdates = result.proposal.orderUpdates
        .filter((update) => selectedUpdates.has(update.field))
        .map((update) => ({ field: update.field, value: update.value }));
      const outcome = await applyAgreementProposal({
        contractId,
        revisionId: result.revisionId,
        lines,
        orderUpdates,
      });
      if (!outcome.ok) {
        setError(outcome.error);
        router.refresh();
        return;
      }
      setResult(null);
      setDone(
        `Added ${plural(outcome.linesAdded, "line")}${
          outcome.flightsCreated > 0 ? ` and ${plural(outcome.flightsCreated, "flight")}` : ""
        }${
          outcome.orderFieldsUpdated > 0
            ? `, and recorded ${plural(outcome.orderFieldsUpdated, "order fact")}`
            : ""
        }. Each one can be edited or removed above.`,
      );
      router.refresh();
    });
  }

  if (!hasAgreement) {
    return (
      <p className="text-[13px] text-ink-500">
        Attach the signed agreement on the contract&apos;s Policy tab and it can be read into lines
        here.
      </p>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={read} disabled={pending}>
            {pending ? "Reading the agreement…" : "Read the schedule from the agreement"}
          </Button>
          <span className="text-[13px] text-ink-500">
            Proposes one line per instruction in the attached document for you to review; nothing is
            added until you confirm.
            {existingLineCount > 0 &&
              ` ${plural(existingLineCount, "line")} already entered will be listed again if the document repeats them.`}
          </span>
        </div>
        {error && <Alert>{error}</Alert>}
        {done && <Alert variant="info">{done}</Alert>}
      </div>
    );
  }

  const { proposal } = result;
  const selectedCount = proposal.lines.filter((line) => selectedLines.has(line.index)).length;
  const selectedExpected = proposal.lines
    .filter((line) => selectedLines.has(line.index) && line.compile.ok)
    .reduce((sum, line) => sum + (line.compile.ok ? line.compile.expected : 0), 0);

  return (
    <div className="flex flex-col gap-4 rounded border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-ink-900">Read from the agreement</h3>
        <div className="text-[13px] text-ink-500">
          {plural(selectedCount, "line")} ticked, compiling to {selectedExpected}
          {proposal.statedTotalSpots !== null &&
            (selectedExpected === proposal.statedTotalSpots
              ? " — matches the order's total"
              : ` — the order says ${proposal.statedTotalSpots}`)}
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {proposal.lines.length === 0 ? (
        <Alert variant="note">The document yielded no schedule lines.</Alert>
      ) : (
        <ul className="flex flex-col gap-2">
          {proposal.lines.map((line) => (
            <LineRow
              key={line.index}
              line={line}
              checked={selectedLines.has(line.index)}
              onToggle={() =>
                setSelectedLines((current) => {
                  const next = new Set(current);
                  if (next.has(line.index)) next.delete(line.index);
                  else next.add(line.index);
                  return next;
                })
              }
            />
          ))}
        </ul>
      )}

      {proposal.orderUpdates.length > 0 && (
        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
            Order facts the document adds
          </h4>
          <ul className="mt-1 flex flex-col gap-1">
            {proposal.orderUpdates.map((update) => (
              <li key={update.field} className="flex items-center gap-2 text-[13px] text-ink-700">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selectedUpdates.has(update.field)}
                  onChange={() =>
                    setSelectedUpdates((current) => {
                      const next = new Set(current);
                      if (next.has(update.field)) next.delete(update.field);
                      else next.add(update.field);
                      return next;
                    })
                  }
                  aria-label={`Record ${update.label}`}
                />
                <span className="font-semibold">{update.label}:</span> {update.proposedText}
              </li>
            ))}
          </ul>
        </section>
      )}

      {proposal.orderConflicts.length > 0 && (
        <Alert variant="note">
          <div className="font-semibold">The document disagrees with the order as entered:</div>
          <ul className="mt-1 list-disc pl-5">
            {proposal.orderConflicts.map((conflict) => (
              <li key={conflict}>{conflict}</li>
            ))}
          </ul>
          The contract keeps what was entered; change it on the Order step if the document is right.
        </Alert>
      )}

      {proposal.unresolved.length > 0 && (
        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
            Not expressed as a line — enter by hand
          </h4>
          <ul className="mt-1 flex flex-col gap-1">
            {proposal.unresolved.map((entry) => (
              <li key={`${entry.source_text}|${entry.reason}`} className="text-[13px] text-ink-700">
                <span className="italic">&ldquo;{entry.source_text}&rdquo;</span> — {entry.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      {proposal.notes.length > 0 && (
        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">Notes</h4>
          <ul className="mt-1 list-disc pl-5 text-[13px] text-ink-700">
            {proposal.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={apply}
          disabled={pending || (selectedCount === 0 && selectedUpdates.size === 0)}
        >
          {pending
            ? "Adding…"
            : selectedCount > 0
              ? `Add ${plural(selectedCount, "ticked line")}`
              : "Record the ticked facts"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setResult(null);
            setError(null);
          }}
          disabled={pending}
        >
          Discard
        </Button>
      </div>
    </div>
  );
}
