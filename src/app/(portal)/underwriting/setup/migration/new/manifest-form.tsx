"use client";

// Step 1 of a migration batch (docs/underwriting-traffic-redesign.md §14.5).
// The manifest is parsed here, in the browser, with the same pure parser
// the server uses, so every row's problem shows before anything is written:
// a row that can't be read, and a sponsor who isn't on file — with the
// nearest name on file offered as a one-click fix. The fixes travel with the
// form as `underwriter_overrides`; submitMigrationManifest re-parses and
// re-checks everything, so this preview is a courtesy, not the boundary.
// "Documents only" writes nothing here; its entries are made on the
// documents step, one per chosen file.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SecondaryLink } from "@/components/ui/primary-link";
import { ChoiceCards } from "@/components/ui/choice-cards";
import { FieldHint, Input, Label, Textarea, FieldError } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { formatDateRange } from "@/lib/underwriting/line-details";
import {
  applyUnderwriterOverrides,
  parseMigrationManifest,
  resolveManifestUnderwriter,
  suggestUnderwriterName,
  type MigrationManifestRow,
} from "@/lib/underwriting/agreement-migration";
import { submitMigrationManifest } from "../actions";
import { batchDocumentsPath, MIGRATION_PATH } from "../paths";
import { Card } from "@/components/ui/card";
import { pluralize } from "@/lib/format";

type Source = "manifest" | "documents";

const MAX_MANIFEST_BYTES = 1024 * 1024;
const READY_SHOWN = 5;
const TEMPLATE =
  "source_key,underwriter,source_file,contract_identifier,effective_from,effective_to,sponsorship_total,contract_type,drive_file_id,documentation_status,notes\n";

interface Problem {
  row: number | null;
  entry: MigrationManifestRow | null;
  message: string;
  suggestion: string | null;
}

function term(entry: MigrationManifestRow): string {
  if (entry.effectiveFrom && entry.effectiveTo)
    return formatDateRange(entry.effectiveFrom, entry.effectiveTo);
  if (entry.effectiveFrom) return `from ${entry.effectiveFrom}`;
  if (entry.effectiveTo) return `to ${entry.effectiveTo}`;
  return "From the document";
}

export function ManifestForm({
  defaultBatchLabel,
  underwriterNames,
}: {
  defaultBatchLabel: string;
  underwriterNames: string[];
}) {
  const router = useRouter();
  const [batchLabel, setBatchLabel] = useState(defaultBatchLabel);
  const [source, setSource] = useState<Source>("manifest");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Map<number, string>>(new Map());
  const [showAllReady, setShowAllReady] = useState(false);

  const onFile = async (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (file.size > MAX_MANIFEST_BYTES) {
      setFileError("That manifest is over 1 MB.");
      return;
    }
    setText(await file.text());
    setFileName(file.name);
    setOverrides(new Map());
    setPasting(false);
  };

  const check = useMemo(() => {
    if (text.trim() === "") return null;
    const parsed = parseMigrationManifest(text);
    const onFile = underwriterNames.map((name) => ({ id: name, name }));
    const rows = applyUnderwriterOverrides(parsed.rows, overrides);
    const ready: MigrationManifestRow[] = [];
    const problems: Problem[] = parsed.errors.map((error) => ({
      row: error.row,
      entry: null,
      message: error.message,
      suggestion: null,
    }));
    for (const row of rows) {
      if (resolveManifestUnderwriter(row.underwriterName, onFile)) ready.push(row);
      else
        problems.push({
          row: row.row,
          entry: row,
          message: "No underwriter on file by this name",
          suggestion: suggestUnderwriterName(row.underwriterName, underwriterNames),
        });
    }
    problems.sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
    return { ready, problems };
  }, [text, overrides, underwriterNames]);

  const acceptSuggestion = (row: number, name: string) =>
    setOverrides((previous) => new Map(previous).set(row, name));

  const labelOk = batchLabel.trim() !== "";

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="max-w-md">
          <Label htmlFor="batch_label">Batch name</Label>
          <Input
            id="batch_label"
            value={batchLabel}
            maxLength={80}
            placeholder="Business Drive, Sept 2026"
            onChange={(event) => setBatchLabel(event.target.value)}
          />
          <FieldHint>
            Use an existing batch’s name to add to it — say, to load a corrected manifest.
          </FieldHint>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-bold text-ink-900">
            Where do the facts come from?
          </legend>
          <ChoiceCards<Source>
            name="source"
            columns={2}
            value={source}
            onChange={setSource}
            options={[
              {
                value: "manifest",
                title: "A spreadsheet of agreements",
                description:
                  "Sponsor, dates and totals come from your CSV; the schedule comes from each document. Recommended.",
              },
              {
                value: "documents",
                title: "Documents only",
                description:
                  "For a few agreements the spreadsheet missed. Every fact is read from the document.",
              },
            ]}
          />
        </fieldset>

        {source === "documents" ? (
          <div className="flex flex-col gap-3 border-t border-line pt-5">
            <p className="max-w-2xl text-sm text-ink-700">
              Next you’ll choose the documents. Each one becomes its own draft, and its sponsor must
              already be on file. Check each draft’s facts on review — nothing typed backs them up.
            </p>
            <div>
              <Button
                type="button"
                disabled={!labelOk}
                onClick={() =>
                  router.push(batchDocumentsPath(batchLabel.trim(), { mode: "documents" }))
                }
              >
                Continue to documents
              </Button>
            </div>
          </div>
        ) : (
          <form action={submitMigrationManifest} className="flex flex-col gap-6">
            <input type="hidden" name="batch_label" value={batchLabel} />
            <input type="hidden" name="manifest_text" value={text} />
            <input
              type="hidden"
              name="underwriter_overrides"
              value={JSON.stringify(Object.fromEntries(overrides))}
            />

            <div>
              <span className="mb-1.5 block text-sm font-bold text-ink-900">Manifest</span>
              {fileName && !pasting ? (
                <div className="flex items-center gap-3 rounded border border-line bg-panel-50 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-ink-900">{fileName}</div>
                    <div className="text-[13px] text-ink-500">
                      {check ? `${check.ready.length + check.problems.length} rows` : "No rows"}
                    </div>
                  </div>
                  <label className="inline-flex h-9 cursor-pointer items-center rounded border border-brand-link px-3 text-sm font-bold text-brand-link hover:bg-brand-surface">
                    Replace
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      className="sr-only"
                      onChange={(event) => onFile(event.target.files?.[0])}
                    />
                  </label>
                </div>
              ) : pasting ? (
                <Textarea
                  aria-label="Manifest rows"
                  rows={6}
                  value={text}
                  placeholder="underwriter,source_file,…"
                  onChange={(event) => {
                    setText(event.target.value);
                    setFileName(null);
                  }}
                />
              ) : (
                <label className="flex cursor-pointer flex-col items-center gap-1 rounded border-2 border-dashed border-[#9FB7CA] bg-[#F7FAFC] px-6 py-8 text-center hover:border-brand-primary">
                  <span className="text-[15px] font-bold text-ink-900">
                    Choose the manifest CSV
                  </span>
                  <span className="text-[13px] text-ink-500">
                    Save the spreadsheet as CSV. One row per agreement.
                  </span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={(event) => onFile(event.target.files?.[0])}
                  />
                </label>
              )}
              {fileError && <FieldError>{fileError}</FieldError>}
              <p className="mt-2 text-[13px] text-ink-500">
                {pasting ? (
                  <button
                    type="button"
                    className="font-bold text-brand-link"
                    onClick={() => setPasting(false)}
                  >
                    Choose a file instead
                  </button>
                ) : (
                  <>
                    Or{" "}
                    <button
                      type="button"
                      className="font-bold text-brand-link"
                      onClick={() => setPasting(true)}
                    >
                      paste the rows instead
                    </button>
                    .
                  </>
                )}
              </p>
            </div>

            {check && (
              <section aria-labelledby="check-rows" className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 id="check-rows" className="text-base font-bold text-ink-900">
                    Check the rows
                  </h3>
                  <span className="text-sm text-ink-700">
                    <strong>{check.ready.length}</strong> ready
                    {check.problems.length > 0 && (
                      <>
                        {" · "}
                        <strong className="text-danger">{check.problems.length}</strong>{" "}
                        <span className="text-danger">
                          {check.problems.length === 1 ? "needs" : "need"} a fix
                        </span>
                      </>
                    )}
                  </span>
                </div>
                <TableFrame>
                  <Table>
                    <thead>
                      <HeaderRow>
                        <Th className="w-14">Row</Th>
                        <Th>Sponsor</Th>
                        <Th>Term</Th>
                        <Th>Document</Th>
                        <Th>Status</Th>
                      </HeaderRow>
                    </thead>
                    <tbody>
                      {check.problems.map((problem, index) => (
                        <Row key={`p${problem.row ?? "x"}-${index}`} className="bg-warning-bg/40">
                          <Cell className="text-ink-500">{problem.row ?? "—"}</Cell>
                          <Cell className="font-bold text-ink-900">
                            {problem.entry?.underwriterName ?? "—"}
                          </Cell>
                          <Cell>{problem.entry ? term(problem.entry) : "—"}</Cell>
                          <Cell className="text-xs text-ink-500">
                            {problem.entry?.sourceFile ?? "—"}
                          </Cell>
                          <Cell>
                            <div className="font-bold text-danger">{problem.message}</div>
                            {problem.entry && problem.suggestion && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                <span>
                                  Did you mean <strong>{problem.suggestion}</strong>?
                                </span>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  className="h-8 px-3"
                                  onClick={() =>
                                    acceptSuggestion(problem.entry!.row, problem.suggestion!)
                                  }
                                >
                                  Use it
                                </Button>
                              </div>
                            )}
                            {problem.entry && !problem.suggestion && (
                              <div className="mt-1 text-xs text-ink-500">
                                Add them under Underwriters, or correct the spelling, then load the
                                manifest again.
                              </div>
                            )}
                          </Cell>
                        </Row>
                      ))}
                      {(showAllReady ? check.ready : check.ready.slice(0, READY_SHOWN)).map(
                        (entry) => (
                          <Row key={`r${entry.row}`}>
                            <Cell className="text-ink-500">{entry.row}</Cell>
                            <Cell>
                              {entry.underwriterName}
                              {overrides.has(entry.row) && (
                                <div className="text-xs text-ink-500">Name corrected</div>
                              )}
                            </Cell>
                            <Cell>{term(entry)}</Cell>
                            <Cell className="text-xs text-ink-500">{entry.sourceFile}</Cell>
                            <Cell>
                              <Badge variant="success">Ready</Badge>
                            </Cell>
                          </Row>
                        ),
                      )}
                    </tbody>
                  </Table>
                  {check.ready.length > READY_SHOWN && (
                    <button
                      type="button"
                      onClick={() => setShowAllReady((value) => !value)}
                      className="h-10 w-full border-t border-line bg-panel-50 text-sm font-bold text-brand-link"
                    >
                      {showAllReady ? "Show fewer" : `Show all ${check.ready.length} ready rows`}
                    </button>
                  )}
                </TableFrame>
              </section>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
              <Button type="submit" disabled={!labelOk || !check || check.ready.length === 0}>
                {check && check.ready.length > 0
                  ? `Load ${pluralize(check.ready.length, "entry", "entries")} and continue`
                  : "Load and continue"}
              </Button>
              <SecondaryLink href={MIGRATION_PATH}>Cancel</SecondaryLink>
              {check && check.problems.length > 0 && check.ready.length > 0 && (
                <span className="text-[13px] text-ink-500">
                  The {pluralize(check.problems.length, "row", "rows")} that need a fix are left
                  out. Fix them and load the manifest again — nothing loads twice.
                </span>
              )}
            </div>
          </form>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <Card className="px-4 py-4 text-sm">
          <h3 className="mb-2 text-sm font-bold text-ink-900">Columns</h3>
          <div className="text-xs font-bold uppercase tracking-wide text-ink-500">Required</div>
          <ul className="mb-3 mt-1.5 flex flex-col gap-1">
            <li>
              <code className="font-mono text-xs">underwriter</code> — a name on file
            </li>
            <li>
              <code className="font-mono text-xs">source_file</code> — the document’s file name
            </li>
          </ul>
          <div className="text-xs font-bold uppercase tracking-wide text-ink-500">Optional</div>
          <p className="mt-1.5 break-words font-mono text-xs leading-relaxed text-ink-700">
            source_key, contract_identifier, effective_from, effective_to, sponsorship_total,
            contract_type, drive_file_id, documentation_status, notes
          </p>
          <a
            className="mt-3 inline-block font-bold text-brand-link"
            download="migration-manifest-template.csv"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
          >
            Download a template
          </a>
        </Card>
        <div className="rounded border border-line bg-panel-50 px-4 py-4 text-sm text-ink-700">
          <h3 className="mb-1.5 text-sm font-bold text-ink-900">Who wins a disagreement</h3>
          <p>
            What the spreadsheet says is kept. Where the document reads differently, the draft is
            flagged for a look before anyone activates it.
          </p>
          <p className="mt-2">
            Keep <code className="font-mono text-xs">source_key</code> the same when you correct and
            reload the manifest, so an entry is updated rather than added twice.
          </p>
        </div>
      </aside>
    </div>
  );
}
