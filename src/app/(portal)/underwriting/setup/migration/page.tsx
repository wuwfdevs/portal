import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PrimaryLink, SecondaryLink, TextLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { formatStationTimestamp } from "@/lib/log/timezone";
import { requireAgreementMigrationAccess } from "@/lib/underwriting/access";
import {
  emptyCategoryCounts,
  summarizeMigrationBatches,
  type MigrationBatchSummary,
  type MigrationItemCategory,
} from "@/lib/underwriting/agreement-migration";
import { BatchProgress } from "./batch-progress";
import { MigrationTabs } from "./migration-tabs";
import { batchDocumentsPath, batchPath, NEW_BATCH_PATH } from "./paths";
import { pluralize } from "@/lib/format";

const TILES: { category: MigrationItemCategory; title: string; hint: string; tone: string }[] = [
  {
    category: "needs_look",
    title: "Needs a look",
    hint: "Drafts where the document and manifest disagree, or a line wasn’t saved",
    tone: "text-warning-fg",
  },
  {
    category: "ready",
    title: "Ready to activate",
    hint: "Drafts with nothing flagged",
    tone: "text-success-fg",
  },
  {
    category: "failed",
    title: "Failed",
    hint: "Couldn’t be read; each can run again",
    tone: "text-danger",
  },
  {
    category: "not_run",
    title: "Not run yet",
    hint: "Waiting on their document",
    tone: "text-ink-700",
  },
];

/** What the batch most needs next, as a link — or "Done" once every entry has a draft with nothing flagged. */
function NextStep({ batch }: { batch: MigrationBatchSummary }) {
  const { counts } = batch;
  if (counts.needs_look > 0)
    return (
      <SecondaryLink size="sm" href={batchPath(batch.label, { show: "needs_look" })}>
        Review {counts.needs_look}
      </SecondaryLink>
    );
  if (counts.failed > 0)
    return (
      <SecondaryLink size="sm" href={batchPath(batch.label, { show: "failed" })}>
        See {counts.failed} failed
      </SecondaryLink>
    );
  if (counts.not_run > 0)
    return (
      <SecondaryLink size="sm" href={batchDocumentsPath(batch.label)}>
        Add {pluralize(counts.not_run, "document", "documents")}
      </SecondaryLink>
    );
  if (counts.importing > 0) return <Badge variant="accent">Importing</Badge>;
  return <Badge variant="success">Done</Badge>;
}

/**
 * Migrating legacy agreements (docs/underwriting-traffic-redesign.md §14):
 * every batch at a glance, and a new one. An administrator's tool, reached
 * from the Contracts list; not in the tabs.
 */
export default async function AgreementMigrationPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const context = await requireAgreementMigrationAccess();
  if (!context) notFound();
  const { notice } = await searchParams;

  const supabase = await createClient();
  const items = await supabase
    .from("uw_agreement_migration_items")
    .select("batch_label, underwriter_name, updated_at, status, contract_id, started_at, result")
    .then((result) => unwrapRead(result, "the migration entries") ?? []);

  const batches = summarizeMigrationBatches(items);
  const totals = emptyCategoryCounts();
  for (const batch of batches)
    for (const category of Object.keys(totals) as MigrationItemCategory[])
      totals[category] += batch.counts[category];

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <TextLink href="/underwriting/setup" className="text-xs">
            ← Setup
          </TextLink>
          <h2 className="mt-2 text-xl font-bold text-ink-900">Migrate legacy records</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-700">
            Bring signed agreements from before the portal in as draft contracts. Nothing schedules
            until someone reviews a draft and activates it.
          </p>
        </div>
        <PrimaryLink href={NEW_BATCH_PATH}>+ New batch</PrimaryLink>
      </div>

      <MigrationTabs active="agreements" />

      {notice && <Alert variant="success">{notice}</Alert>}

      {batches.length === 0 ? (
        <div className="max-w-3xl rounded border border-line bg-panel-50 px-5 py-6 text-sm text-ink-700">
          <p className="font-bold text-ink-900">No batches yet.</p>
          <p className="mt-1">
            Start with a spreadsheet of the agreements (one row each) and the folder of signed
            documents. Each becomes a draft contract for review.
          </p>
        </div>
      ) : (
        <>
          <section
            aria-label="Across every batch"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            {TILES.map((tile) => (
              <Link
                key={tile.category}
                href={batchPath("", { show: tile.category })}
                className="flex flex-col gap-1 rounded border border-line px-4 py-3.5 hover:border-brand-primary"
              >
                <span className={`text-xs font-bold uppercase tracking-wide ${tile.tone}`}>
                  {tile.title}
                </span>
                <span className="font-serif text-3xl font-bold text-ink-900">
                  {totals[tile.category]}
                </span>
                <span className="text-[13px] text-ink-500">{tile.hint}</span>
              </Link>
            ))}
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-base font-bold text-ink-900">Batches</h3>
            <TableFrame>
              <Table>
                <thead>
                  <HeaderRow>
                    <Th>Batch</Th>
                    <Th>Entries</Th>
                    <Th className="w-80">Progress</Th>
                    <Th>Last activity</Th>
                    <Th className="text-right">Next step</Th>
                  </HeaderRow>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <Row key={batch.label}>
                      <Cell>
                        <Link
                          href={batchPath(batch.label)}
                          className="text-[15px] font-bold text-brand-link"
                        >
                          {batch.label}
                        </Link>
                        <div className="mt-0.5 text-xs text-ink-500">
                          {batch.documentsOnly ? "Documents only" : "From a manifest"}
                        </div>
                      </Cell>
                      <Cell>{batch.total}</Cell>
                      <Cell>
                        <BatchProgress counts={batch.counts} total={batch.total} />
                      </Cell>
                      <Cell className="whitespace-nowrap text-ink-500">
                        {formatStationTimestamp(batch.lastActivity)}
                      </Cell>
                      <Cell className="text-right">
                        <NextStep batch={batch} />
                      </Cell>
                    </Row>
                  ))}
                </tbody>
              </Table>
            </TableFrame>
            <p className="max-w-3xl text-[13px] text-ink-500">
              Running a batch again never makes a second contract: an entry that already has a draft
              is skipped. Delete a draft to free its entry for another try.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
