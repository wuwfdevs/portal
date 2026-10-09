import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PrimaryLink, SecondaryLink, TextLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { cn } from "@/lib/cn";
import { requireAgreementMigrationAccess } from "@/lib/underwriting/access";
import {
  emptyCategoryCounts,
  migrationCheckCount,
  migrationItemCategory,
  parseMigrationItemResult,
  type ManifestDifference,
  type MigrationItemCategory,
} from "@/lib/underwriting/agreement-migration";
import { formatDateRange } from "@/lib/underwriting/line-details";
import { CATEGORY_META } from "../batch-progress";
import { batchDocumentsPath, batchPath, MIGRATION_PATH, NEW_BATCH_PATH } from "../paths";
import { Card } from "@/components/ui/card";
import { pluralize } from "@/lib/format";
import { indexBy } from "@/lib/collections";

type Show = MigrationItemCategory | "all";
const SHOWS: Show[] = ["needs_look", "failed", "ready", "not_run", "importing", "all"];
const SHOW_LABEL: Record<Show, string> = {
  needs_look: "Needs a look",
  failed: "Failed",
  ready: "Ready to activate",
  not_run: "Not run",
  importing: "Importing",
  all: "All",
};

function formatDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDifferenceValue(difference: ManifestDifference, value: string): string {
  if (difference.field === "effective_from" || difference.field === "effective_to")
    return formatDay(value);
  if (difference.field === "sponsorship_total") {
    const amount = Number(value);
    return Number.isFinite(amount)
      ? amount.toLocaleString("en-US", { style: "currency", currency: "USD" })
      : value;
  }
  return value;
}

/**
 * A migration batch's review (docs/underwriting-traffic-redesign.md §14.5),
 * or every batch's when `b` is absent: what needs a person's eye first,
 * each entry's draft, and — on `?details=<id>` — where the document and the
 * manifest disagree and what couldn't be saved.
 */
export default async function MigrationBatchPage({
  searchParams,
}: {
  searchParams: Promise<{ b?: string; show?: string; q?: string; details?: string }>;
}) {
  const context = await requireAgreementMigrationAccess();
  if (!context) notFound();
  const params = await searchParams;
  const batchLabel = params.b?.trim() || null;
  const query = params.q?.trim() ?? "";

  const supabase = await createClient();
  let request = supabase
    .from("uw_agreement_migration_items")
    .select("*")
    .order("batch_label")
    .order("manifest_row", { nullsFirst: false })
    .order("source_file");
  if (batchLabel) request = request.eq("batch_label", batchLabel);
  const [items, contracts] = await Promise.all([
    request.then((result) => unwrapRead(result, "the migration entries") ?? []),
    supabase
      .from("uw_contracts")
      .select("id, status, contract_identifier")
      .not("import_source_key", "is", null)
      .then((result) => unwrapRead(result, "the imported contracts") ?? []),
  ]);
  const contractById = indexBy(contracts, (contract) => contract.id);

  const now = new Date();
  const withCategory = items.map((item) => ({
    item,
    category: migrationItemCategory(item, now),
    result: parseMigrationItemResult(item.result),
  }));
  const counts = emptyCategoryCounts();
  for (const entry of withCategory) counts[entry.category] += 1;

  const requested = SHOWS.includes(params.show as Show) ? (params.show as Show) : null;
  const show: Show = requested ?? (counts.needs_look > 0 ? "needs_look" : "all");
  const needle = query.toLowerCase();
  const shown = withCategory.filter(
    ({ item, category }) =>
      (show === "all" || category === show) &&
      (needle === "" ||
        [item.underwriter_name, item.source_file, item.contract_identifier, item.source_key]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(needle))),
  );

  const here = (extra: Record<string, string | undefined>) =>
    batchPath(batchLabel ?? "", { show, q: query || undefined, ...extra });
  const chips = SHOWS.filter(
    (value) => value === "all" || value !== "importing" || counts.importing > 0,
  ).map((value) => ({
    label: SHOW_LABEL[value],
    href: batchPath(batchLabel ?? "", { show: value, q: query || undefined }),
    active: show === value,
    count: value === "all" ? items.length : counts[value],
  }));
  const documentsOnly = items.length > 0 && items.every((item) => item.underwriter_name === null);

  if (batchLabel && items.length === 0) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <TextLink href={MIGRATION_PATH}>← Migrations</TextLink>
          <h2 className="mt-2 text-xl font-bold text-ink-900">{batchLabel ?? "Every batch"}</h2>
          <p className="mt-1 text-sm text-ink-500">
            {pluralize(items.length, "entry", "entries")}
            {batchLabel ? (documentsOnly ? " · documents only" : " · from a manifest") : ""}
          </p>
        </div>
        {batchLabel && (
          <div className="flex flex-wrap gap-2">
            {!documentsOnly && (
              <SecondaryLink
                size="sm"
                href={`${NEW_BATCH_PATH}?b=${encodeURIComponent(batchLabel)}`}
              >
                Reload manifest
              </SecondaryLink>
            )}
            {counts.not_run + counts.failed > 0 ? (
              <PrimaryLink
                href={batchDocumentsPath(batchLabel, documentsOnly ? { mode: "documents" } : {})}
              >
                Run {counts.not_run + counts.failed} not imported
              </PrimaryLink>
            ) : (
              <SecondaryLink
                size="sm"
                href={batchDocumentsPath(batchLabel, documentsOnly ? { mode: "documents" } : {})}
              >
                Add documents
              </SecondaryLink>
            )}
          </div>
        )}
      </div>

      <ListToolbar
        search={{
          placeholder: "Sponsor, file, or order number",
          label: "Search entries",
          defaultValue: query,
          hidden: { ...(batchLabel ? { b: batchLabel } : {}), show },
        }}
        chips={chips}
        chipsLabel="Show"
      />

      {shown.length === 0 ? (
        <Alert variant="note">
          {query
            ? "No entries match that search."
            : `No entries are ${SHOW_LABEL[show].toLowerCase()}.`}
        </Alert>
      ) : (
        <TableFrame>
          <Table>
            <thead>
              <HeaderRow>
                <Th className="w-10">
                  <span className="sr-only">Details</span>
                </Th>
                <Th>Sponsor</Th>
                {!batchLabel && <Th>Batch</Th>}
                <Th>Order</Th>
                <Th>Term</Th>
                <Th>Lines</Th>
                <Th>Status</Th>
                <Th className="text-right">Draft</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {shown.map(({ item, category, result }) => {
                const contract = item.contract_id ? contractById.get(item.contract_id) : undefined;
                const open = params.details === item.id;
                const checks = migrationCheckCount(result);
                const expandable =
                  category === "needs_look" || category === "ready" || category === "failed";
                const name = item.underwriter_name ?? "From the document";
                const columns = batchLabel ? 7 : 8;
                return [
                  <Row
                    key={item.id}
                    className={cn(open && "bg-panel-50 hover:bg-panel-50", open && "border-b-0")}
                  >
                    <Cell>
                      {expandable && (
                        <Link
                          href={here({ details: open ? undefined : item.id })}
                          aria-expanded={open}
                          aria-label={`${open ? "Hide" : "Show"} details for ${name}`}
                          scroll={false}
                          className="inline-flex h-7 w-7 items-center justify-center rounded text-ink-700 hover:bg-panel-100"
                        >
                          <span aria-hidden="true">{open ? "▾" : "▸"}</span>
                        </Link>
                      )}
                    </Cell>
                    <Cell>
                      <div className="font-bold text-ink-900">{name}</div>
                      <div className="mt-0.5 break-all font-mono text-xs text-ink-500">
                        {item.source_file}
                        {item.manifest_row !== null ? ` · row ${item.manifest_row}` : ""}
                      </div>
                    </Cell>
                    {!batchLabel && (
                      <Cell>
                        <TextLink href={batchPath(item.batch_label)}>{item.batch_label}</TextLink>
                      </Cell>
                    )}
                    <Cell>{contract?.contract_identifier ?? item.contract_identifier ?? "—"}</Cell>
                    <Cell className="whitespace-nowrap">
                      {item.effective_from && item.effective_to
                        ? formatDateRange(item.effective_from, item.effective_to)
                        : "—"}
                    </Cell>
                    <Cell className="whitespace-nowrap">
                      {result && item.status === "imported" && !result.recovered
                        ? `${result.lines_saved} of ${result.lines_read}`
                        : "—"}
                    </Cell>
                    <Cell>
                      {category === "needs_look" ? (
                        <Badge variant="warning">{checks} to check</Badge>
                      ) : (
                        <Badge variant={CATEGORY_META[category].badge}>
                          {item.status === "imported" && !item.contract_id
                            ? "Draft deleted"
                            : CATEGORY_META[category].label}
                        </Badge>
                      )}
                      {category === "failed" && item.last_error && (
                        <p className="mt-1 max-w-xs text-xs text-danger">{item.last_error}</p>
                      )}
                      {item.attempts > 1 && (
                        <div className="mt-1 text-xs text-ink-500">{item.attempts} attempts</div>
                      )}
                    </Cell>
                    <Cell className="text-right">
                      {contract ? (
                        <div className="flex flex-col items-end gap-1">
                          <TextLink
                            href={`/underwriting/contracts/${contract.id}/schedule`}
                            className="whitespace-nowrap"
                          >
                            Open draft
                          </TextLink>
                          {contract.status !== "draft" && (
                            <Badge variant="neutral">{contract.status}</Badge>
                          )}
                        </div>
                      ) : category === "failed" || category === "not_run" ? (
                        <TextLink
                          href={batchDocumentsPath(
                            item.batch_label,
                            item.underwriter_name === null ? { mode: "documents" } : {},
                          )}
                          className="whitespace-nowrap"
                        >
                          {category === "failed" ? "Run again" : "Add document"}
                        </TextLink>
                      ) : null}
                    </Cell>
                  </Row>,
                  open ? (
                    <tr key={`${item.id}-details`} className="border-b border-line bg-panel-50">
                      <td />
                      <td colSpan={columns - 1} className="px-4 pb-5 pt-1">
                        <EntryDetails
                          result={result}
                          lastError={category === "failed" ? item.last_error : null}
                          contractId={contract?.id ?? null}
                        />
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </Table>
        </TableFrame>
      )}
      <p className="max-w-3xl text-[13px] text-ink-500">
        “Ready to activate” means the import flagged nothing — each draft still needs someone to
        look it over and activate it on its contract page.
      </p>
    </div>
  );
}

function EntryDetails({
  result,
  lastError,
  contractId,
}: {
  result: ReturnType<typeof parseMigrationItemResult>;
  lastError: string | null;
  contractId: string | null;
}) {
  if (lastError)
    return (
      <div className="max-w-3xl text-sm text-ink-700">
        <p className="font-bold text-danger">{lastError}</p>
        <p className="mt-1">
          Fix the cause, then run it again from the documents step. Nothing is created twice.
        </p>
      </div>
    );
  if (!result) return <p className="text-sm text-ink-500">No details were recorded.</p>;
  const scheduleHref = contractId ? `/underwriting/contracts/${contractId}/schedule` : null;
  const nothing =
    result.differences.length === 0 && result.warnings.length === 0 && result.unresolved === 0;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {nothing && <p className="text-sm text-ink-700">The import flagged nothing on this draft.</p>}
      {result.differences.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-bold text-ink-900">
            Where the document and the manifest disagree
          </h4>
          <TableFrame>
            <Table stack>
              <thead>
                <HeaderRow>
                  <Th>Field</Th>
                  <Th>Manifest (used)</Th>
                  <Th>Document says</Th>
                </HeaderRow>
              </thead>
              <tbody>
                {result.differences.map((difference, index) => (
                  <Row key={index}>
                    <Cell stack="title">{difference.label}</Cell>
                    <Cell label="Manifest (used)" className="font-bold text-ink-900">
                      {formatDifferenceValue(difference, difference.manifest)}
                    </Cell>
                    <Cell label="Document says" className="font-bold text-warning-fg">
                      {formatDifferenceValue(difference, difference.document)}
                    </Cell>
                  </Row>
                ))}
              </tbody>
            </Table>
          </TableFrame>
          <p className="mt-2 text-[13px] text-ink-500">
            If the spreadsheet is wrong, correct the draft’s order details. If the document is
            wrong, there’s nothing to do.
          </p>
        </div>
      )}
      {(result.unresolved > 0 || result.warnings.length > 0) && (
        <div className="flex flex-col gap-3">
          {result.unresolved > 0 && (
            <Card className="px-4 py-3 text-sm">
              <div className="font-bold text-ink-900">
                {pluralize(result.unresolved, "instruction", "instructions")} couldn’t be saved as a
                line
              </div>
              <p className="mt-1 text-ink-700">
                The schedule step lists each one with what the document says, ready to enter.
              </p>
              {scheduleHref && (
                <SecondaryLink size="sm" href={scheduleHref} className="mt-2">
                  Enter on the schedule
                </SecondaryLink>
              )}
            </Card>
          )}
          {result.warnings.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-sm font-bold text-ink-900">Also check</h4>
              <ul className="list-disc pl-5 text-sm text-ink-700">
                {result.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
