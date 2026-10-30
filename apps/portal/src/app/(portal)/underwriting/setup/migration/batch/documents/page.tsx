import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { requireAgreementMigrationAccess } from "@/lib/underwriting/access";
import { canRunMigrationItem } from "@/lib/underwriting/agreement-migration";
import { formatDateRange } from "@/lib/underwriting/line-details";
import { batchPath, MIGRATION_PATH } from "../../paths";
import { DocumentsRun, type RunEntry } from "./documents-run";
import { TextLink } from "@/components/ui/primary-link";

/**
 * A batch's documents step (docs/underwriting-traffic-redesign.md §14.5):
 * choose the signed documents, match each entry to its file, and run them.
 * The run happens in the browser, several entries at a time, each through
 * the import route handler; this page only supplies the entries still to run.
 */
export default async function MigrationDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ b?: string; mode?: string; notice?: string }>;
}) {
  const context = await requireAgreementMigrationAccess();
  if (!context) notFound();
  const { b, mode, notice } = await searchParams;
  const batchLabel = b?.trim() ?? "";
  if (batchLabel === "") redirect(MIGRATION_PATH);

  const supabase = await createClient();
  const items = await supabase
    .from("uw_agreement_migration_items")
    .select(
      "id, source_key, source_file, underwriter_name, manifest_row, effective_from, effective_to, status, contract_id, started_at",
    )
    .eq("batch_label", batchLabel)
    .order("manifest_row", { nullsFirst: false })
    .order("source_file")
    .then((result) => unwrapRead(result, "the batch's entries") ?? []);

  const runnable = items.filter((item) => canRunMigrationItem(item));
  const documentsOnly =
    mode === "documents" ||
    (items.length > 0 && items.every((item) => item.underwriter_name === null));
  const entries: RunEntry[] = runnable.map((item) => ({
    id: item.id,
    sourceFile: item.source_file,
    sponsor: item.underwriter_name,
    row: item.manifest_row,
    term:
      item.effective_from && item.effective_to
        ? formatDateRange(item.effective_from, item.effective_to)
        : null,
    failedBefore: item.status === "failed",
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <TextLink href={MIGRATION_PATH}>← Migrations</TextLink>
        <h2 className="mt-2 text-xl font-bold text-ink-900">{batchLabel}</h2>
        {items.length > runnable.length && (
          <p className="mt-1 text-sm text-ink-500">
            {items.length - runnable.length} of {items.length} entries are already imported or
            importing — <TextLink href={batchPath(batchLabel)}>see the batch</TextLink>.
          </p>
        )}
      </div>
      <DocumentsRun
        batchLabel={batchLabel}
        documentsOnly={documentsOnly}
        entries={entries}
        notice={notice ?? null}
      />
    </div>
  );
}
