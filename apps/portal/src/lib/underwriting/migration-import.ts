import "server-only";

// Running one legacy-migration entry (docs/underwriting-traffic-redesign.md
// §14): the entry's document goes through importAgreementAsDraft
// (agreement-import-service.ts), the same path as the order step's "Create
// from the agreement", with the manifest's facts as the typed fields.
// Called by the route handler at /api/underwriting/migration/items/[id]/
// import, once per entry — a route handler rather than a Server Action
// because the migration screen runs several entries at once, and Next.js
// runs one page's Server Actions one after another (§14.5).
//
// Idempotency is layered: an entry that already has its contract never
// runs; a claim (status → processing) is a conditional update, so two runs
// can't take one entry at once; and uw_contracts.import_source_key is
// unique, so even an interrupted run that created its contract before
// recording it is found and linked on the next attempt, never duplicated.

import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit";
import type { UnderwritingContext } from "@/lib/underwriting/access";
import {
  agreementDocumentFromFile,
  importAgreementAsDraft,
  sha256Hex,
} from "@/lib/underwriting/agreement-import-service";
import {
  canRunMigrationItem,
  documentOnlyHash,
  manifestDifferences,
  manifestLineWarnings,
  manifestRowFromItem,
  migrationCheckCount,
  resolveManifestUnderwriter,
  STALE_PROCESSING_MINUTES,
  typedFieldsForDocumentOnly,
  typedFieldsFromManifest,
  type MigrationItemResult,
} from "@/lib/underwriting/agreement-migration";
import { listUnderwriters } from "@/lib/underwriting/queries";

export type MigrationRunResult =
  | { ok: true; status: "imported" | "already_imported"; contractId: string; checks: number }
  | { ok: false; status: "failed" | "busy"; error: string }
  /** The provider's rate limit: nothing was created, and the entry can run again after the wait. */
  | { ok: false; status: "rate_limited"; error: string; retryAfterMs: number | null };

/**
 * Runs one entry with its document. The caller has already checked the
 * signed-in user may migrate agreements; RLS on uw_* still applies to every
 * read and write here, through the caller's own session.
 */
export async function runMigrationItem(
  context: UnderwritingContext,
  itemId: string,
  document: FormDataEntryValue | null,
): Promise<MigrationRunResult> {
  const { profile } = context;
  const supabase = await createClient();

  const { data: item, error: itemError } = await supabase
    .from("uw_agreement_migration_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (itemError) return { ok: false, status: "failed", error: itemError.message };
  if (!item) return { ok: false, status: "failed", error: "That migration entry doesn't exist." };

  if (item.status === "imported" && item.contract_id)
    return { ok: true, status: "already_imported", contractId: item.contract_id, checks: 0 };

  // A contract already carrying this key — an earlier run created it and
  // was cut off before recording it. Link it; never create a second.
  const linkExisting = async (): Promise<MigrationRunResult | null> => {
    const { data: contract, error: contractError } = await supabase
      .from("uw_contracts")
      .select("id")
      .eq("import_source_key", item.source_key)
      .maybeSingle();
    if (contractError) return { ok: false, status: "failed", error: contractError.message };
    if (!contract) return null;
    const result: MigrationItemResult = {
      lines_read: 0,
      lines_saved: 0,
      flights_created: 0,
      unresolved: 0,
      differences: [],
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
    return { ok: true, status: "already_imported", contractId: contract.id, checks: 1 };
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

  // Checked before claiming, so a missing underwriter, a bad file, or a
  // document already imported never costs a model call. A documents-only
  // entry (§14.3) has no underwriter to check: the reading supplies it.
  let underwriterId: string | null = null;
  if (item.underwriter_name !== null) {
    const underwriters = await listUnderwriters();
    const underwriter = resolveManifestUnderwriter(
      item.underwriter_name,
      underwriters.map((entry) => ({ id: entry.id, name: entry.name })),
    );
    if (!underwriter)
      return fail(
        `"${item.underwriter_name}" isn't an underwriter on file. Add them under Underwriters (or correct the manifest's spelling), then run this entry again.`,
      );
    underwriterId = underwriter.id;
  }

  const upload = await agreementDocumentFromFile(document);
  if (!upload.ok) return fail(upload.error);
  const documentSha256 = sha256Hex(upload.document.bytes);

  const keyedHash = documentOnlyHash(item.source_key);
  if (keyedHash !== null && keyedHash !== documentSha256)
    return fail("That isn't the document this entry was made from — choose the same file again.");

  // One document, one contract, whichever entry it came in under: a
  // manifest row and a documents-only entry for the same PDF must not both
  // import it.
  const { data: sameDocument, error: sameDocumentError } = await supabase
    .from("uw_agreement_migration_items")
    .select("source_key")
    .eq("document_sha256", documentSha256)
    .eq("status", "imported")
    .not("contract_id", "is", null)
    .neq("id", item.id)
    .limit(1);
  if (sameDocumentError) return { ok: false, status: "failed", error: sameDocumentError.message };
  if (sameDocument && sameDocument.length > 0)
    return fail(
      `This document was already imported as entry ${sameDocument[0]!.source_key}. Delete that draft first if this entry should own it.`,
    );

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
      document_sha256: documentSha256,
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

  const entry =
    item.underwriter_name !== null
      ? manifestRowFromItem({ ...item, underwriter_name: item.underwriter_name })
      : null;
  let imported;
  try {
    imported = await importAgreementAsDraft(supabase, profile.id, {
      document: upload.document,
      typed:
        entry && underwriterId
          ? typedFieldsFromManifest(entry, underwriterId, item.batch_label)
          : typedFieldsForDocumentOnly(
              { sourceKey: item.source_key, sourceFile: item.source_file },
              item.batch_label,
            ),
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
    if (imported.rateLimited) {
      await fail(imported.error);
      return {
        ok: false,
        status: "rate_limited",
        error: imported.error,
        retryAfterMs: imported.retryAfterMs ?? null,
      };
    }
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
    warnings: [
      ...imported.warnings,
      ...(entry ? manifestLineWarnings(entry, imported.output) : []),
    ],
    differences: entry ? manifestDifferences(entry, imported.output) : [],
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
    checks: migrationCheckCount(result),
  };
}
