import "server-only";
// The one import path for a signed agreement (docs/underwriting-traffic-
// redesign.md §12, §14): read the document with the model, merge its facts
// under the typed ones (mergeOrderFacts), store the document at the
// contract's own path, create the draft contract and its first revision,
// save every read line that compiles through the same parser and insert a
// hand-entered line goes through, keep the reading on the contract, and
// audit it. Extracted from createContractFromAgreement so the order step's
// upload and the legacy-agreement migration (one entry at a time) are the
// same code — there is no second importer. Returns a result rather than
// redirecting; each caller decides where the user lands.

import { createHash } from "node:crypto";
import type { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit";
import { readAgreementWithAI, type AgreementDocument } from "./agreement-ai-import";
import {
  mergeOrderFacts,
  proposeScheduleFromModelOutput,
  type AgreementModelOutput,
  type AgreementReading,
  type AgreementReadingLineOutcome,
  type TypedOrderFields,
} from "./agreement-import";
import { createDraftContractWithRevision } from "./contract-writes";
import { listProgramOptions } from "./placement";
import { poolPermitsProgram } from "./pool-targets";
import { listInventoryPools, listUnderwriters } from "./queries";
import { parseScheduleLineForm } from "./schedule-line-form";
import { insertScheduleLineWithBuckets } from "./schedule-line-writes";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export const CONTRACT_DOCUMENTS_BUCKET = "underwriting-documents";
export const MAX_AGREEMENT_BYTES = 10 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

/** The upload's content type from its declared type or, failing that, its name — the same three types the Agreement tab's upload accepts. */
export function agreementContentType(file: { type: string; name: string }): string | null {
  if (file.type in EXTENSIONS) return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return null;
}

/** A File from a form as the model's document, or the reason it can't be one. */
export async function agreementDocumentFromFile(
  file: FormDataEntryValue | null,
): Promise<{ ok: true; document: AgreementDocument } | { ok: false; error: string }> {
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "Choose the signed agreement to read (PDF, PNG, or JPEG)." };
  if (file.size > MAX_AGREEMENT_BYTES)
    return { ok: false, error: "That file is too large to be an agreement (10 MB at most)." };
  const contentType = agreementContentType(file);
  if (!contentType)
    return { ok: false, error: "That file type isn't supported. Use PDF, PNG, or JPEG." };
  return {
    ok: true,
    document: {
      bytes: new Uint8Array(await file.arrayBuffer()),
      filename: file.name,
      contentType,
    },
  };
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface ImportAgreementInput {
  document: AgreementDocument;
  /** What a person (or the migration manifest) states — wins over the reading. */
  typed: TypedOrderFields;
  accountRep?: string | null;
  /** The migration's idempotency key, unique on uw_contracts — a second import under one key fails at the insert. */
  importSourceKey?: string | null;
  /** Merged into the audit event's metadata (the migration's item id and batch, say). */
  auditMetadata?: Record<string, unknown>;
}

export type ImportAgreementFailureStage = "read" | "facts" | "store" | "create";

export type ImportAgreementResult =
  | {
      ok: true;
      contractId: string;
      documentPath: string;
      documentSha256: string;
      output: AgreementModelOutput;
      linesRead: number;
      linesSaved: number;
      flightsCreated: number;
      unresolved: number;
      /** The merge's warnings, then each unsaved line's reason. */
      warnings: string[];
    }
  | {
      ok: false;
      stage: ImportAgreementFailureStage;
      error: string;
      /** Set when the create failed because the key is already taken — the caller links the existing contract. */
      duplicateKey?: boolean;
      /** Set when the reading hit the provider's rate limit — nothing was created; try again after `retryAfterMs`. */
      rateLimited?: boolean;
      retryAfterMs?: number | null;
    };

export async function importAgreementAsDraft(
  supabase: ServerSupabase,
  actorId: string,
  input: ImportAgreementInput,
): Promise<ImportAgreementResult> {
  const { document, typed } = input;

  const [underwriters, pools, programs] = await Promise.all([
    listUnderwriters(),
    listInventoryPools(),
    listProgramOptions(),
  ]);
  const activePools = pools.filter((pool) => pool.active);
  const typedUnderwriter = underwriters.find((entry) => entry.id === typed.underwriter_id) ?? null;

  const read = await readAgreementWithAI({
    document,
    underwriterNames: underwriters.map((entry) => entry.name),
    poolNames: activePools.map((pool) => pool.name),
    programNames: programs.map((program) => program.name),
    typed: {
      underwriterName: typedUnderwriter?.name ?? null,
      contractIdentifier: typed.contract_identifier || null,
      effectiveFrom: typed.effective_from || null,
      effectiveTo: typed.effective_to || null,
    },
  });
  if (!read.ok)
    return {
      ok: false,
      stage: "read",
      error: read.error,
      rateLimited: read.rateLimited,
      retryAfterMs: read.retryAfterMs,
    };

  const facts = mergeOrderFacts(
    typed,
    read.output.order,
    underwriters.map((entry) => ({ id: entry.id, name: entry.name })),
  );
  if (!facts.ok) return { ok: false, stage: "facts", error: facts.error };

  // The contract's id is minted here so the document can be stored at the
  // same per-contract path the Agreement tab's upload uses before the row
  // exists — an orphaned object if the insert then fails is harmless and
  // overwritten by the next attempt's upsert.
  const contractId = crypto.randomUUID();
  const documentPath = `${contractId}/agreement.${EXTENSIONS[document.contentType] ?? "pdf"}`;
  const { error: uploadError } = await supabase.storage
    .from(CONTRACT_DOCUMENTS_BUCKET)
    .upload(documentPath, document.bytes, { contentType: document.contentType, upsert: true });
  if (uploadError) {
    console.error("Could not store the uploaded agreement", uploadError);
    return {
      ok: false,
      stage: "store",
      error: `Could not store the agreement: ${uploadError.message}`,
    };
  }

  const created = await createDraftContractWithRevision(supabase, actorId, {
    ...facts.value,
    id: contractId,
    agreement_document_path: documentPath,
    account_rep: input.accountRep ?? null,
    import_source_key: input.importSourceKey ?? null,
  });
  if (!created.ok) {
    return {
      ok: false,
      stage: "create",
      error: created.error,
      duplicateKey: created.duplicateImportKey === true,
    };
  }

  // Every read line that compiles becomes an ordinary draft line; the
  // outcome per line is kept so the schedule step can list the rest.
  const proposal = proposeScheduleFromModelOutput(read.output, {
    pools: activePools.map((pool) => ({ id: pool.id, name: pool.name })),
    programs: programs.map((program) => ({ id: program.id, name: program.name })),
    flights: [],
  });
  const poolTargets = new Map(activePools.map((pool) => [pool.id, pool.targets]));
  const flightIdByName = new Map<string, string>();
  const outcomes: AgreementReadingLineOutcome[] = [];
  let linesSaved = 0;
  let flightsCreated = 0;

  for (const line of proposal.lines) {
    const parsed = parseScheduleLineForm(line.values);
    if (!parsed.ok) {
      outcomes.push({ saved: false, error: parsed.error });
      continue;
    }
    const { pool_id, program_id } = parsed.value.line;
    if (pool_id && program_id && !poolPermitsProgram(poolTargets.get(pool_id) ?? [], program_id)) {
      outcomes.push({
        saved: false,
        error: "The pool never places into that program — keep one or the other.",
      });
      continue;
    }

    let flightId = parsed.value.line.flight_id;
    if (line.newFlight) {
      const key = line.newFlight.name.toLowerCase();
      if (!flightIdByName.has(key)) {
        const { data, error } = await supabase
          .from("uw_contract_flights")
          .insert({
            contract_id: contractId,
            name: line.newFlight.name,
            start_date: line.newFlight.start_date,
            end_date: line.newFlight.end_date,
            created_by: actorId,
          })
          .select("id")
          .single();
        if (error || !data) {
          console.error("Could not create a flight the agreement names", error);
          outcomes.push({
            saved: false,
            error: `Could not create the flight "${line.newFlight.name}" this line belongs to.`,
          });
          continue;
        }
        flightIdByName.set(key, data.id);
        flightsCreated += 1;
      }
      flightId = flightIdByName.get(key) ?? null;
    }

    const inserted = await insertScheduleLineWithBuckets(
      supabase,
      { contractId, revisionId: created.revisionId, createdBy: actorId },
      { ...parsed.value, line: { ...parsed.value.line, flight_id: flightId } },
    );
    if (!inserted.ok) {
      outcomes.push({ saved: false, error: inserted.error });
      continue;
    }
    outcomes.push({ saved: true, error: null });
    linesSaved += 1;
  }

  const reading: AgreementReading = {
    version: 1,
    read_at: new Date().toISOString(),
    document_path: documentPath,
    output: read.output,
    lines: outcomes,
    warnings: facts.warnings,
  };
  const { error: readingError } = await supabase
    .from("uw_contracts")
    .update({ agreement_reading: JSON.parse(JSON.stringify(reading)) })
    .eq("id", contractId);
  if (readingError) console.error("Could not keep the agreement reading", readingError);

  const documentSha256 = sha256Hex(document.bytes);
  await logAuditEvent({
    actorId,
    action: "underwriting.contract.created_from_agreement",
    targetType: "uw_contract",
    targetId: contractId,
    metadata: {
      document_path: documentPath,
      document_sha256: documentSha256,
      lines_read: proposal.lines.length,
      lines_saved: linesSaved,
      flights_created: flightsCreated,
      unresolved: proposal.unresolved.length,
      ...input.auditMetadata,
    },
  });

  return {
    ok: true,
    contractId,
    documentPath,
    documentSha256,
    output: read.output,
    linesRead: proposal.lines.length,
    linesSaved,
    flightsCreated,
    unresolved: proposal.unresolved.length,
    warnings: [
      ...facts.warnings,
      ...(readingError ? ["The reading couldn't be kept on the contract."] : []),
      ...outcomes.flatMap((outcome, index) =>
        outcome.saved
          ? []
          : [
              `Line ${index + 1} (${proposal.lines[index]?.values.label || "unnamed"}) wasn't saved: ${outcome.error}`,
            ],
      ),
    ],
  };
}
