"use server";

// The legacy-agreement migration (docs/underwriting-traffic-redesign.md
// §14). Two actions:
//
//   submitMigrationManifest — loads a manifest (CSV) into
//   uw_agreement_migration_items, keyed on each entry's source_key. A
//   resubmission updates an entry's facts only while it has no contract,
//   so rerunning with a corrected spreadsheet is always safe.
//
//   registerDocumentOnlyEntries — makes an entry of each chosen file the
//   manifest doesn't name (§14.3).
//
// Running an entry is not here: it's lib/underwriting/migration-import.ts
// behind a route handler, so the screen can run several at once (§14.5).

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertAgreementMigrationAccess } from "@/lib/underwriting/access";
import { failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import {
  applyUnderwriterOverrides,
  canRunMigrationItem,
  canUpdateMigrationItemFacts,
  documentOnlySourceKey,
  isSha256Hex,
  migrationItemFactsFromRow,
  parseMigrationManifest,
  parseUnderwriterOverrides,
  resolveManifestUnderwriter,
} from "@/lib/underwriting/agreement-migration";
import { listUnderwriters } from "@/lib/underwriting/queries";
import { batchDocumentsPath, NEW_BATCH_PATH } from "./paths";

const MAX_MANIFEST_BYTES = 1024 * 1024;
const BATCH_LABEL_MAX = 80;
/** How many manifest errors the redirect message spells out; the rest are counted. */
const ERRORS_SHOWN = 8;

export async function submitMigrationManifest(formData: FormData): Promise<void> {
  const { profile } = await assertAgreementMigrationAccess();

  const batchLabel = String(formData.get("batch_label") ?? "").trim();
  if (batchLabel === "")
    failWith(NEW_BATCH_PATH, "Name the batch, e.g. “Business Drive, Sept 2026”.");
  if (batchLabel.length > BATCH_LABEL_MAX)
    failWith(NEW_BATCH_PATH, `A batch name can be at most ${BATCH_LABEL_MAX} characters.`);

  let text = String(formData.get("manifest_text") ?? "");
  const file = formData.get("manifest_file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_MANIFEST_BYTES) failWith(NEW_BATCH_PATH, "That manifest is over 1 MB.");
    text = await file.text();
  }
  if (text.trim() === "")
    failWith(NEW_BATCH_PATH, "Choose the manifest's CSV file, or paste its contents.");

  // Every row whose underwriter isn't on file is left out, as the preview
  // said — after applying the names the preview's "Use it" chose.
  const parsed = parseMigrationManifest(text);
  const underwriters = await listUnderwriters();
  const withOverrides = applyUnderwriterOverrides(
    parsed.rows,
    parseUnderwriterOverrides(String(formData.get("underwriter_overrides") ?? "")),
  );
  const unknown = withOverrides.filter(
    (row) =>
      !resolveManifestUnderwriter(
        row.underwriterName,
        underwriters.map((entry) => ({ id: entry.id, name: entry.name })),
      ),
  );
  const manifest = {
    rows: withOverrides.filter((row) => !unknown.includes(row)),
    errors: [
      ...parsed.errors,
      ...unknown.map((row) => ({
        row: row.row,
        message: `"${row.underwriterName}" isn't an underwriter on file`,
      })),
    ].sort((a, b) => (a.row ?? 0) - (b.row ?? 0)),
  };
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
    failWith(NEW_BATCH_PATH, errorSummary || "The manifest has no rows.");

  const supabase = await createClient();
  // The whole table, not an .in() over the manifest's keys: it holds a few
  // hundred rows at most, and a long .in() list is a query string
  // PostgREST refuses (CLAUDE.md, "Log couldn't load, again").
  const { data: existing, error: readError } = await supabase
    .from("uw_agreement_migration_items")
    .select("id, source_key, status, contract_id, started_at");
  if (readError) failWith(NEW_BATCH_PATH, `Could not read the migration: ${readError.message}`);
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
    if (error) failWith(NEW_BATCH_PATH, `Could not update ${row.sourceKey}: ${error.message}`);
    updated += 1;
  }
  if (inserts.length > 0) {
    const { error } = await supabase.from("uw_agreement_migration_items").insert(inserts);
    if (error) failWith(NEW_BATCH_PATH, `Could not load the manifest: ${error.message}`);
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
  redirect(batchDocumentsPath(batchLabel, { notice }));
}

/**
 * Documents-only entries (§14.3): one per chosen file, keyed by its hash,
 * which the browser computes so the files themselves travel only with each
 * entry's own import. An existing key is returned as it is — choosing the
 * same file again finds its entry rather than making another.
 */
export async function registerDocumentOnlyEntries(input: {
  batchLabel: string;
  documents: { filename: string; sha256: string }[];
}): Promise<
  | {
      ok: true;
      entries: { sha256: string; id: string; runnable: boolean; contractId: string | null }[];
    }
  | { ok: false; error: string }
> {
  let context;
  try {
    context = await assertAgreementMigrationAccess();
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
  const batchLabel = input.batchLabel.trim();
  if (batchLabel === "") return { ok: false, error: "Name the batch first." };
  if (batchLabel.length > BATCH_LABEL_MAX)
    return { ok: false, error: `A batch name can be at most ${BATCH_LABEL_MAX} characters.` };
  if (input.documents.length === 0) return { ok: false, error: "Choose at least one document." };
  if (
    input.documents.some((document) => !isSha256Hex(document.sha256) || !document.filename.trim())
  )
    return { ok: false, error: "A document couldn't be identified; choose the files again." };

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("uw_agreement_migration_items")
    .select("id, source_key, status, contract_id, started_at");
  if (readError) return { ok: false, error: `Could not read the migration: ${readError.message}` };
  const byKey = new Map((existing ?? []).map((item) => [item.source_key, item]));

  const fresh = [
    ...new Map(
      input.documents
        .filter((document) => !byKey.has(documentOnlySourceKey(document.sha256)))
        .map((document) => [document.sha256, document]),
    ).values(),
  ];
  if (fresh.length > 0) {
    const { data: inserted, error } = await supabase
      .from("uw_agreement_migration_items")
      .insert(
        fresh.map((document) => ({
          source_key: documentOnlySourceKey(document.sha256),
          batch_label: batchLabel,
          source_file: document.filename.trim(),
          created_by: context.profile.id,
          updated_by: context.profile.id,
        })),
      )
      .select("id, source_key, status, contract_id, started_at");
    if (error) return { ok: false, error: `Could not add the documents: ${error.message}` };
    for (const item of inserted ?? []) byKey.set(item.source_key, item);
    await logAuditEvent({
      actorId: context.profile.id,
      action: "underwriting.migration.documents_added",
      targetType: "uw_agreement_migration_batch",
      metadata: { batch_label: batchLabel, added: fresh.length },
    });
  }

  const entries = [];
  for (const document of input.documents) {
    const item = byKey.get(documentOnlySourceKey(document.sha256));
    if (!item) return { ok: false, error: `Could not add ${document.filename}.` };
    entries.push({
      sha256: document.sha256,
      id: item.id,
      runnable: canRunMigrationItem(item),
      contractId: item.contract_id,
    });
  }
  return { ok: true, entries };
}
