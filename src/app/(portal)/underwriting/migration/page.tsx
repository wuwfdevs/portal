import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterChips } from "@/components/ui/filter-chips";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { requireAgreementMigrationAccess } from "@/lib/underwriting/access";
import {
  canRunMigrationItem,
  parseMigrationItemResult,
} from "@/lib/underwriting/agreement-migration";
import type { UwAgreementMigrationStatus } from "@/lib/database.types";
import { submitMigrationManifest } from "./actions";
import { RunImports } from "./run-imports";

// Each entry's import is a model call, run as a Server Action from this
// page; raised here, never in actions.ts (CLAUDE.md's Sourcework Phase 3b
// note), the same budget the order step's "Create from the agreement" has.
export const maxDuration = 300;

const STATUS_BADGE: Record<UwAgreementMigrationStatus, { label: string; variant: BadgeVariant }> = {
  pending: { label: "Not run", variant: "neutral" },
  processing: { label: "Importing", variant: "accent" },
  imported: { label: "Imported", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
};

/**
 * Migrating legacy agreements (docs/underwriting-traffic-redesign.md §14):
 * load a manifest, choose its documents, import each entry through the
 * order step's own agreement import, and review every draft it made. An
 * administrator's tool, reached from the Contracts list; not in the tabs.
 */
export default async function AgreementMigrationPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string; error?: string; notice?: string }>;
}) {
  const context = await requireAgreementMigrationAccess();
  if (!context) notFound();
  const { batch, error, notice } = await searchParams;

  const supabase = await createClient();
  const [items, contracts] = await Promise.all([
    supabase
      .from("uw_agreement_migration_items")
      .select("*")
      .order("batch_label")
      .order("manifest_row")
      .then((result) => unwrapRead(result, "the migration entries") ?? []),
    supabase
      .from("uw_contracts")
      .select("id, status, contract_identifier")
      .not("import_source_key", "is", null)
      .then((result) => unwrapRead(result, "the imported contracts") ?? []),
  ]);
  const contractById = new Map(contracts.map((contract) => [contract.id, contract]));

  const batches = [...new Set(items.map((item) => item.batch_label))];
  const activeBatch = batch && batches.includes(batch) ? batch : null;
  const shown = activeBatch ? items.filter((item) => item.batch_label === activeBatch) : items;
  const count = (status: UwAgreementMigrationStatus) =>
    shown.filter((item) => item.status === status).length;
  const runnable = shown.filter((item) => canRunMigrationItem(item));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/underwriting/contracts" className="text-sm font-bold text-brand-link">
          ← Contracts
        </Link>
        <h2 className="mt-2 text-xl font-bold text-ink-900">Migrate legacy agreements</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-700">
          Each entry is read the same way “Create from the agreement” reads one: the manifest’s
          facts win over the document, the schedule comes from the document, and the result is a
          draft contract. Nothing schedules until someone reviews and activates it. Running a
          manifest again never creates a second contract for an entry.
        </p>
      </div>

      {error && <Alert>{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <section className="max-w-3xl rounded border border-line bg-panel-50 px-5 py-4">
        <h3 className="text-sm font-bold text-ink-900">1. Load a manifest</h3>
        <form action={submitMigrationManifest} className="mt-3 flex flex-col gap-4">
          <div>
            <Label htmlFor="batch_label">Batch name</Label>
            <Input
              id="batch_label"
              name="batch_label"
              required
              maxLength={80}
              defaultValue={activeBatch ?? ""}
              placeholder="Business Drive, Sept 2026"
            />
          </div>
          <div>
            <Label htmlFor="manifest_file">Manifest (CSV)</Label>
            <Input id="manifest_file" name="manifest_file" type="file" accept=".csv,text/csv" />
            <FieldHint>
              First row names the columns. Required: <code>underwriter</code> and{" "}
              <code>source_file</code>. Optional: <code>source_key</code>,{" "}
              <code>contract_identifier</code>, <code>effective_from</code>,{" "}
              <code>effective_to</code>, <code>sponsorship_total</code>, <code>contract_type</code>,{" "}
              <code>drive_file_id</code>, <code>documentation_status</code>, <code>notes</code>.
              Each entry is keyed by <code>source_key</code>, else the Drive file id, else the file
              name — keep it the same when you correct and reload the manifest. Underwriter names
              must match one on file exactly.
            </FieldHint>
          </div>
          <div>
            <Label htmlFor="manifest_text">Or paste it</Label>
            <Textarea id="manifest_text" name="manifest_text" rows={4} />
          </div>
          <div>
            <Button type="submit">Load manifest</Button>
          </div>
        </form>
      </section>

      {items.length > 0 && (
        <>
          <section className="flex max-w-3xl flex-col gap-3">
            <h3 className="text-sm font-bold text-ink-900">2. Import</h3>
            {batches.length > 1 && (
              <FilterChips
                label="Batch"
                chips={[
                  {
                    label: "All batches",
                    href: "/underwriting/migration",
                    active: activeBatch === null,
                    count: items.length,
                  },
                  ...batches.map((label) => ({
                    label,
                    href: `/underwriting/migration?batch=${encodeURIComponent(label)}`,
                    active: activeBatch === label,
                    count: items.filter((item) => item.batch_label === label).length,
                  })),
                ]}
              />
            )}
            <p className="text-sm text-ink-700">
              {shown.length} entries: {count("imported")} imported, {count("failed")} failed,{" "}
              {count("pending")} not run
              {count("processing") > 0 ? `, ${count("processing")} importing` : ""}.
            </p>
            <RunImports
              items={runnable.map((item) => ({
                id: item.id,
                sourceKey: item.source_key,
                sourceFile: item.source_file,
                underwriterName: item.underwriter_name,
              }))}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-bold text-ink-900">3. Review</h3>
            <TableFrame>
              <Table>
                <thead>
                  <HeaderRow>
                    <Th>Entry</Th>
                    <Th>Manifest</Th>
                    <Th>Status</Th>
                    <Th>Result</Th>
                  </HeaderRow>
                </thead>
                <tbody>
                  {shown.map((item) => {
                    const result = parseMigrationItemResult(item.result);
                    const contract = item.contract_id ? contractById.get(item.contract_id) : null;
                    const badge =
                      item.status === "imported" && !item.contract_id
                        ? { label: "Draft deleted", variant: "warning" as const }
                        : STATUS_BADGE[item.status];
                    return (
                      <Row key={item.id} className="align-top">
                        <Cell>
                          <div className="font-bold text-ink-900">{item.underwriter_name}</div>
                          <div className="mt-0.5 text-xs text-ink-500">
                            {item.source_key}
                            {item.manifest_row !== null ? ` · row ${item.manifest_row}` : ""}
                          </div>
                          <div className="mt-0.5 text-xs text-ink-500">{item.source_file}</div>
                        </Cell>
                        <Cell className="text-xs text-ink-700">
                          <div>{item.contract_identifier ?? "No order number"}</div>
                          <div>
                            {item.effective_from ?? "?"} – {item.effective_to ?? "?"}
                          </div>
                          {item.sponsorship_total !== null && (
                            <div>${Number(item.sponsorship_total).toFixed(2)}</div>
                          )}
                          {item.contract_type && <div>{item.contract_type}</div>}
                          {item.documentation_status && (
                            <div className="text-warning-fg">{item.documentation_status}</div>
                          )}
                        </Cell>
                        <Cell>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                          {item.attempts > 1 && (
                            <div className="mt-1 text-xs text-ink-500">
                              {item.attempts} attempts
                            </div>
                          )}
                        </Cell>
                        <Cell className="text-xs text-ink-700">
                          {item.last_error && <p className="text-danger">{item.last_error}</p>}
                          {contract && (
                            <Link
                              href={`/underwriting/contracts/${contract.id}/schedule`}
                              className="font-bold text-brand-link"
                            >
                              {contract.contract_identifier} ({contract.status})
                            </Link>
                          )}
                          {result && item.status === "imported" && (
                            <>
                              <p className="mt-0.5">
                                {result.lines_saved} of {result.lines_read} lines saved
                                {result.unresolved > 0
                                  ? `, ${result.unresolved} instruction${result.unresolved === 1 ? "" : "s"} not expressed`
                                  : ""}
                                {result.flights_created > 0
                                  ? `, ${result.flights_created} flight${result.flights_created === 1 ? "" : "s"}`
                                  : ""}
                                .
                              </p>
                              {result.warnings.length > 0 && (
                                <details className="mt-1">
                                  <summary className="cursor-pointer text-warning-fg">
                                    {result.warnings.length} to review
                                  </summary>
                                  <ul className="mt-1 list-disc pl-4">
                                    {result.warnings.map((warning, index) => (
                                      <li key={index}>{warning}</li>
                                    ))}
                                  </ul>
                                </details>
                              )}
                            </>
                          )}
                        </Cell>
                      </Row>
                    );
                  })}
                </tbody>
              </Table>
            </TableFrame>
          </section>
        </>
      )}
    </div>
  );
}
