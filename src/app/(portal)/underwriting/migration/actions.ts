"use server";

// The legacy-agreement migration (docs/underwriting-traffic-redesign.md
// §14). Two actions:
//
//   submitMigrationManifest — loads a manifest (CSV) into
//   uw_agreement_migration_items, keyed on each entry's source_key. A
//   resubmission updates an entry's facts only while it has no contract,
//   so rerunning with a corrected spreadsheet is always safe.
//
//   importMigrationItem — runs ONE entry, with its document, through
//   importAgreementAsDraft (lib/underwriting/agreement-import-service.ts),
//   the same path as the order step's "Create from the agreement", with the
//   manifest's facts as the typed fields. Non-redirecting: the migration
//   screen calls it once per entry, in sequence, and shows each result.
//   One entry per request because each is a model call of up to a minute or
//   two; there is no job queue.
//
// Idempotency is layered: an entry that already has its contract never
// runs; a claim (status → processing) is a conditional update, so two tabs
// can't run one entry at once; and uw_contracts.import_source_key is unique,
// so even an interrupted run that created its contract before recording it
// is found and linked on the next attempt, never duplicated.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertAgreementMigrationAccess } from "@/lib/underwriting/access";
import { failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import {
  agreementDocumentFromFile,
  importAgreementAsDraft,
  sha256Hex,
} from "@/lib/underwriting/agreement-import-service";
import {
  canRunMigrationItem,
  canUpdateMigrationItemFacts,
  manifestDiscrepancies,
  manifestRowFromItem,
  migrationItemFactsFromRow,
  parseMigrationManifest,
  resolveManifestUnderwriter,
  STALE_PROCESSING_MINUTES,
  typedFieldsFromManifest,
  type MigrationItemResult,
} from "@/lib/underwriting/agreement-migration";
import { listUnderwriters } from "@/lib/underwriting/queries";

const MIGRATION_PATH = "/underwriting/migration";
const MAX_MANIFEST_BYTES = 1024 * 1024;
const BATCH_LABEL_MAX = 80;
/** How many manifest errors the redirect message spells out; the rest are counted. */
const ERRORS_SHOWN = 8;

export async function submitMigrationManifest(formData: FormData): Promise<void> {
  const { profile } = await assertAgreementMigrationAccess();

  const batchLabel = String(formData.get("batch_label") ?? "").trim();
  if (batchLabel === "")
    failWith(MIGRATION_PATH, "Name the batch, e.g. “Business Drive, Sept 2026”.");
  if (batchLabel.length > BATCH_LABEL_MAX)
    failWith(MIGRATION_PATH, `A batch name can be at most ${BATCH_LABEL_MAX} characters.`);

  let text = String(formData.get("manifest_text") ?? "");
  const file = formData.get("manifest_file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_MANIFEST_BYTES) failWith(MIGRATION_PATH, "That manifest is over 1 MB.");
    text = await file.text();
  }
  if (text.trim() === "")
    failWith(MIGRATION_PATH, "Choose the manifest's CSV file, or paste its contents.");

  const manifest = parseMigrationManifest(text);
  const errorSummary = manifest.errors
    .slice(0, ERRORS_SHOWN)
    .map((error) => (error.row === null ? error.message : `Row ${error.row}: ${error.message}`))
    .concat(
      manifest.errors.length > ERRORS_SHOWN
        ? [`…and ${manifest.errors.length - ERRORS_SHOWN} more.`]
        : [],
    )
    .join(" ");
  if (manifest.rows.length === 0)
    failWith(MIGRATION_PATH, errorSummary || "The manifest has no rows.");

  const supabase = await createClient();
  // The whole table, not an .in() over the manifest's keys: it holds a few
  // hundred rows at most, and a long .in() list is a query string
  // PostgREST refuses (CLAUDE.md, "Log couldn't load, again").
  const { data: existing, error: readError } = await supabase
    .from("uw_agreement_migration_items")
    .select("id, source_key, status, contract_id, started_at");
  if (readError) failWith(MIGRATION_PATH, `Could not read the migration: ${readError.message}`);
  const existingByKey = new Map((existing ?? []).map((item) => [item.source_key, item]));

  const inserts = [];
  let updated = 0;
  let unchanged = 0;
  for (const row of manifest.rows) {
    const facts = migrationItemFactsFromRow(row, batchLabel);
    const current = existingByKey.get(row.sourceKey);
    if (!current) {
      inserts.push({
        ...facts,
        source_key: row.sourceKey,
        created_by: profile.id,
        updated_by: profile.id,
      });
      continue;
    }
    if (!canUpdateMigrationItemFacts(current)) {
      unchanged += 1;
      continue;
    }
    const { error } = await supabase
      .from("uw_agreement_migration_items")
      .update({
        ...facts,
        // A corrected entry runs again from the start.
        status: current.status === "processing" ? "pending" : current.status,
        updated_by: profile.id,
      })
      .eq("id", current.id);
    if (error) failWith(MIGRATION_PATH, `Could not update ${row.sourceKey}: ${error.message}`);
    updated += 1;
  }
  if (inserts.length > 0) {
    const { error } = await supabase.from("uw_agreement_migration_items").insert(inserts);
    if (error) failWith(MIGRATION_PATH, `Could not load the manifest: ${error.message}`);
  }

  await logAuditEvent({
    actorId: profile.id,
    action: "underwriting.migration.manifest_submitted",
    targetType: "uw_agreement_migration_batch",
    metadata: {
      batch_label: batchLabel,
      rows: manifest.rows.length,
      added: inserts.length,
      updated,
      already_imported: unchanged,
      rejected_rows: manifest.errors.map((error) => error.row),
    },
  });

  const notice = [
    `Loaded ${manifest.rows.length} ${manifest.rows.length === 1 ? "entry" : "entries"}: ${inserts.length} new, ${updated} updated, ${unchanged} already imported (left as they are).`,
    manifest.errors.length > 0 ? `Skipped — ${errorSummary}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  redirect(
    `${MIGRATION_PATH}?batch=${encodeURIComponent(batchLabel)}&notice=${encodeURIComponent(notice)}`,
  );
}

export type MigrationRunResult =
  | { ok: true; status: "imported" | "already_imported"; contractId: string; warnings: number }
  | { ok: false; status: "failed" | "busy"; error: string };

export async function importMigrationItem(formData: FormData): Promise<MigrationRunResult> {
  let context;
  try {
    context = await assertAgreementMigrationAccess();
  } catch (error) {
    return { ok: false, status: "failed", error: (error as Error).message };
  }
  const { profile } = context;
  const itemId = String(formData.get("item_id") ?? "");
  const supabase = await createClient();

  const { data: item, error: itemError } = await supabase
    .from("uw_agreement_migration_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (itemError) return { ok: false, status: "failed", error: itemError.message };
  if (!item) return { ok: false, status: "failed", error: "That migration entry doesn't exist." };

  if (item.status === "imported" && item.contract_id)
    return { ok: true, status: "already_imported", contractId: item.contract_id, warnings: 0 };

  // A contract already carrying this key — an earlier run created it and
  // was cut off before recording it. Link it; never create a second.
  const linkExisting = async (): Promise<MigrationRunResult | null> => {
    const { data: contract } = await supabase
      .from("uw_contracts")
      .select("id")
      .eq("import_source_key", item.source_key)
      .maybeSingle();
    if (!contract) return null;
    const result: MigrationItemResult = {
      lines_read: 0,
      lines_saved: 0,
      flights_created: 0,
      unresolved: 0,
      warnings: [
        "Found a contract already imported under this key (an earlier run was interrupted). Check its schedule step before activating.",
      ],
      recovered: true,
    };
    const { error } = await supabase
      .from("uw_agreement_migration_items")
      .update({
        status: "imported",
        contract_id: contract.id,
        last_error: null,
        finished_at: new Date().toISOString(),
        result: JSON.parse(JSON.stringify(result)),
        updated_by: profile.id,
      })
      .eq("id", item.id);
    if (error) return { ok: false, status: "failed", error: error.message };
    return { ok: true, status: "already_imported", contractId: contract.id, warnings: 1 };
  };
  const linked = await linkExisting();
  if (linked) return linked;

  if (!canRunMigrationItem(item))
    return { ok: false, status: "busy", error: "This entry is being imported by another run." };

  const fail = async (message: string): Promise<MigrationRunResult> => {
    await supabase
      .from("uw_agreement_migration_items")
      .update({
        status: "failed",
        last_error: message,
        finished_at: new Date().toISOString(),
        updated_by: profile.id,
      })
      .eq("id", item.id);
    return { ok: false, status: "failed", error: message };
  };

  // Checked before claiming, so a missing underwriter or a bad file never
  // costs a model call.
  const underwriters = await listUnderwriters();
  const underwriter = resolveManifestUnderwriter(
    item.underwriter_name,
    underwriters.map((entry) => ({ id: entry.id, name: entry.name })),
  );
  if (!underwriter)
    return fail(
      `"${item.underwriter_name}" isn't an underwriter on file. Add them under Underwriters (or correct the manifest's spelling), then run this entry again.`,
    );

  const upload = await agreementDocumentFromFile(formData.get("document"));
  if (!upload.ok) return fail(upload.error);

  // Claim the entry: a conditional update, so two runs can't both proceed.
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MINUTES * 60_000).toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("uw_agreement_migration_items")
    .update({
      status: "processing",
      attempts: item.attempts + 1,
      started_at: new Date().toISOString(),
      finished_at: null,
      last_error: null,
      document_sha256: sha256Hex(upload.document.bytes),
      updated_by: profile.id,
    })
    .eq("id", item.id)
    .or(
      `status.in.(pending,failed),and(status.eq.imported,contract_id.is.null),and(status.eq.processing,started_at.is.null),and(status.eq.processing,started_at.lt."${staleBefore}")`,
    )
    .select("id");
  if (claimError) return { ok: false, status: "failed", error: claimError.message };
  if (!claimed || claimed.length === 0)
    return { ok: false, status: "busy", error: "This entry is being imported by another run." };

  const entry = manifestRowFromItem(item);
  let imported;
  try {
    imported = await importAgreementAsDraft(supabase, profile.id, {
      document: upload.document,
      typed: typedFieldsFromManifest(entry, underwriter.id, item.batch_label),
      importSourceKey: item.source_key,
      auditMetadata: {
        source: "legacy_migration",
        migration_item_id: item.id,
        source_key: item.source_key,
        batch_label: item.batch_label,
        source_file: item.source_file,
      },
    });
  } catch (error) {
    console.error("Migration import threw", error);
    return fail(`The import stopped unexpectedly: ${(error as Error).message}`);
  }

  if (!imported.ok) {
    if (imported.duplicateKey) {
      const relinked = await linkExisting();
      if (relinked) return relinked;
    }
    await logAuditEvent({
      actorId: profile.id,
      action: "underwriting.migration.item_failed",
      targetType: "uw_agreement_migration_item",
      targetId: item.id,
      metadata: { source_key: item.source_key, stage: imported.stage, error: imported.error },
    });
    return fail(imported.error);
  }

  const result: MigrationItemResult = {
    lines_read: imported.linesRead,
    lines_saved: imported.linesSaved,
    flights_created: imported.flightsCreated,
    unresolved: imported.unresolved,
    warnings: [...imported.warnings, ...manifestDiscrepancies(entry, imported.output)],
  };
  const { error: recordError } = await supabase
    .from("uw_agreement_migration_items")
    .update({
      status: "imported",
      contract_id: imported.contractId,
      document_sha256: imported.documentSha256,
      last_error: null,
      finished_at: new Date().toISOString(),
      result: JSON.parse(JSON.stringify(result)),
      updated_by: profile.id,
    })
    .eq("id", item.id);
  if (recordError) {
    // The contract exists and carries the key; the next run links it.
    console.error("Imported, but could not record it on the migration entry", recordError);
    return {
      ok: false,
      status: "failed",
      error: `Imported, but could not record it here (${recordError.message}) — run the entry again to link it.`,
    };
  }
  return {
    ok: true,
    status: "imported",
    contractId: imported.contractId,
    warnings: result.warnings.length + result.unresolved,
  };
}
