import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import type { AgreementProposal, AgreementReading } from "@/lib/underwriting/agreement-import";

/**
 * What the agreement's reading could NOT put on the schedule
 * (docs/underwriting-traffic-redesign.md §12). The lines it could save are
 * ordinary draft lines in the list above this, reviewed like any other;
 * this section lists the rest — a line whose reading the parser refused,
 * with "Enter" prefilling the editor from it so what the model got right
 * is kept; the instructions the model could not express as a line; its
 * notes; and the warnings from merging the order's facts. Renders nothing
 * when the reading left nothing to look at.
 */
export function AgreementReadingNotes({
  contractId,
  reading,
  proposal,
}: {
  contractId: string;
  reading: AgreementReading;
  proposal: AgreementProposal;
}) {
  const unsaved = proposal.lines.filter((line) => !reading.lines[line.index]?.saved);
  const saved = proposal.lines.length - unsaved.length;
  const nothingToShow =
    unsaved.length === 0 &&
    proposal.unresolved.length === 0 &&
    proposal.notes.length === 0 &&
    reading.warnings.length === 0;
  if (nothingToShow) return null;

  return (
    <section aria-labelledby="from-agreement" className="mb-5 flex flex-col gap-3">
      <h3
        id="from-agreement"
        className="text-[11px] font-bold uppercase tracking-wider text-ink-500"
      >
        From the agreement
      </h3>
      <p className="text-[13px] text-ink-500">
        {saved} of {proposal.lines.length} lines read from the attached agreement were saved above.
        {unsaved.length > 0 && " These could not be:"}
      </p>

      {unsaved.length > 0 && (
        <ul className="flex flex-col gap-2">
          {unsaved.map((line) => {
            const error = reading.lines[line.index]?.error;
            return (
              <li
                key={line.index}
                className="flex flex-wrap items-start gap-3 rounded border border-line px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-ink-900">
                    {line.values.label || line.description}
                  </div>
                  {line.values.source_text && (
                    <blockquote className="mt-1 border-l-2 border-line pl-2 text-[13px] italic text-ink-500">
                      {line.values.source_text}
                    </blockquote>
                  )}
                  {error && <div className="mt-1 text-[13px] text-danger">{error}</div>}
                  {line.warnings.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-[13px] text-warning-fg">
                      {line.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <Link
                  href={`/underwriting/contracts/${contractId}/schedule?prefill=${line.index}#line-editor`}
                  className="inline-flex items-center justify-center rounded px-3 py-2 text-[13px] font-bold text-brand-link hover:bg-brand-surface"
                >
                  Enter
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {proposal.unresolved.length > 0 && (
        <div>
          <div className="text-[13px] font-semibold text-ink-700">
            Not expressed as a line — enter by hand
          </div>
          <ul className="mt-1 flex flex-col gap-1">
            {proposal.unresolved.map((entry) => (
              <li key={`${entry.source_text}|${entry.reason}`} className="text-[13px] text-ink-700">
                <span className="italic">&ldquo;{entry.source_text}&rdquo;</span> — {entry.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(proposal.notes.length > 0 || reading.warnings.length > 0) && (
        <Alert variant="note">
          <ul className="list-disc pl-5">
            {reading.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
            {proposal.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Alert>
      )}
    </section>
  );
}
