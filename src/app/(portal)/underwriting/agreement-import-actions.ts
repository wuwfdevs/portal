"use server";

// Creating a contract from its signed agreement (docs/underwriting-traffic-
// redesign.md §12): the order step's second submit. The uploaded document
// goes through one model call (lib/underwriting/agreement-ai-import.ts);
// what the staffer typed on the step wins and the reading fills the rest
// (mergeOrderFacts); the draft contract is created through the same helper
// createContract uses, the document is stored where the Policy tab's
// upload would have put it, and every read line that compiles is saved
// through the same parser and insert a hand-entered line goes through. The
// reading itself is kept on the contract (agreement_reading) so the
// schedule step can list what could NOT be saved and prefill the editor
// from it. Lands on the schedule step, where the saved lines are reviewed
// like any other: edited, removed, or left alone.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import { readAgreementWithAI } from "@/lib/underwriting/agreement-ai-import";
import {
  mergeOrderFacts,
  proposeScheduleFromModelOutput,
  type AgreementReading,
  type AgreementReadingLineOutcome,
  type TypedOrderFields,
} from "@/lib/underwriting/agreement-import";
import { createDraftContractWithRevision } from "@/lib/underwriting/contract-writes";
import { listProgramOptions } from "@/lib/underwriting/placement";
import { poolPermitsProgram } from "@/lib/underwriting/pool-targets";
import { listInventoryPools, listUnderwriters } from "@/lib/underwriting/queries";
import { parseScheduleLineForm } from "@/lib/underwriting/schedule-line-form";
import { insertScheduleLineWithBuckets } from "@/lib/underwriting/schedule-line-writes";

const NEW_CONTRACT_PATH = "/underwriting/contracts/new";
const CONTRACT_DOCUMENTS_BUCKET = "underwriting-documents";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/** The upload's content type from its declared type or, failing that, its name — the same three types the Policy tab's upload accepts. */
function documentContentType(file: File): string | null {
  if (file.type in CONTENT_TYPES) return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return null;
}

export async function createContractFromAgreement(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();

  const file = formData.get("agreement_file");
  if (!(file instanceof File) || file.size === 0)
    failWith(NEW_CONTRACT_PATH, "Choose the signed agreement to read (PDF, PNG, or JPEG).");
  if (file.size > MAX_UPLOAD_BYTES)
    failWith(NEW_CONTRACT_PATH, "That file is too large to be an agreement (10 MB at most).");
  const contentType = documentContentType(file);
  if (!contentType)
    failWith(NEW_CONTRACT_PATH, "That file type isn't supported. Use PDF, PNG, or JPEG.");

  const typed: TypedOrderFields = {
    underwriter_id: field(formData, "underwriter_id"),
    contract_identifier: field(formData, "contract_identifier"),
    effective_from: field(formData, "effective_from"),
    effective_to: field(formData, "effective_to"),
    sponsorship_total: field(formData, "sponsorship_total"),
    sponsorship_category: field(formData, "sponsorship_category"),
    notes: field(formData, "notes"),
  };

  const [underwriters, pools, programs] = await Promise.all([
    listUnderwriters(),
    listInventoryPools(),
    listProgramOptions(),
  ]);
  const activePools = pools.filter((pool) => pool.active);
  const typedUnderwriter = underwriters.find((entry) => entry.id === typed.underwriter_id) ?? null;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const read = await readAgreementWithAI({
    document: { bytes, filename: file.name, contentType },
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
  if (!read.ok) failWith(NEW_CONTRACT_PATH, read.error);

  const facts = mergeOrderFacts(
    typed,
    read.output.order,
    underwriters.map((entry) => ({ id: entry.id, name: entry.name })),
  );
  if (!facts.ok) failWith(NEW_CONTRACT_PATH, facts.error);

  // The contract's id is minted here so the document can be stored at the
  // same per-contract path the Policy tab's upload uses before the row
  // exists — an orphaned object if the insert then fails is harmless and
  // overwritten by the next attempt's upsert.
  const supabase = await createClient();
  const contractId = crypto.randomUUID();
  const documentPath = `${contractId}/agreement.${CONTENT_TYPES[contentType]}`;
  const { error: uploadError } = await supabase.storage
    .from(CONTRACT_DOCUMENTS_BUCKET)
    .upload(documentPath, bytes, { contentType, upsert: true });
  if (uploadError) {
    console.error("Could not store the uploaded agreement", uploadError);
    failWith(NEW_CONTRACT_PATH, `Could not store the agreement: ${uploadError.message}`);
  }

  const created = await createDraftContractWithRevision(supabase, profile.id, {
    ...facts.value,
    id: contractId,
    agreement_document_path: documentPath,
    // Not something the reading looks for — kept from the form if typed.
    account_rep: field(formData, "account_rep") || null,
  });
  if (!created.ok) failWith(NEW_CONTRACT_PATH, created.error);

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
            created_by: profile.id,
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
      { contractId, revisionId: created.revisionId, createdBy: profile.id },
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

  await logAuditEvent({
    actorId: profile.id,
    action: "underwriting.contract.created_from_agreement",
    targetType: "uw_contract",
    targetId: contractId,
    metadata: {
      document_path: documentPath,
      lines_read: proposal.lines.length,
      lines_saved: linesSaved,
      flights_created: flightsCreated,
      unresolved: proposal.unresolved.length,
    },
  });

  revalidatePath("/underwriting/contracts");
  redirect(`/underwriting/contracts/${contractId}/schedule`);
}
