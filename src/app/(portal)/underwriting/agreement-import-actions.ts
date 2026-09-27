"use server";

// "Read the schedule from the agreement" (docs/underwriting-traffic-
// redesign.md §12): two Server Actions for the schedule step. The first
// reads the contract's attached agreement through the model and returns a
// proposal — the lines as the schedule editor's own values, each already
// parsed and compiled, plus order facts and anything unresolved — writing
// nothing. The second writes the lines a staffer ticked, through the same
// parser and the same insert a hand-entered line goes through. Both return
// plain results for the client component (contracts/[id]/schedule/
// agreement-import.tsx) rather than redirecting, the same non-redirecting
// shape the program-log import uses, since the proposal round-trips through
// the client. The proposal's values travel back as JSON, so applying
// re-parses every line and re-checks access: a tampered proposal can't
// write anything the session couldn't already write by hand.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { logAuditEvent } from "@/lib/audit";
import { readAgreementWithAI } from "@/lib/underwriting/agreement-ai-import";
import {
  proposeScheduleFromModelOutput,
  type AgreementProposal,
  type OrderUpdateField,
  type ProposedFlight,
} from "@/lib/underwriting/agreement-import";
import { canRewriteScheduleLine } from "@/lib/underwriting/line-mutability";
import { listProgramOptions } from "@/lib/underwriting/placement";
import { poolPermitsProgram } from "@/lib/underwriting/pool-targets";
import { getContractDetail, listInventoryPools } from "@/lib/underwriting/queries";
import {
  parseScheduleLineForm,
  type ScheduleLineFormValues,
} from "@/lib/underwriting/schedule-line-form";
import { insertScheduleLineWithBuckets } from "@/lib/underwriting/schedule-line-writes";
import { isValidDateISO } from "@/lib/underwriting/dates";
import type { Database } from "@/lib/database.types";

/** The uw_contracts columns an order fact may write — the whitelist orderUpdateColumn() narrows to. */
type ContractOrderColumns = Pick<
  Database["public"]["Tables"]["uw_contracts"]["Update"],
  | "effective_from"
  | "effective_to"
  | "stated_total_spots"
  | "sponsorship_total"
  | "affidavit_required"
  | "makegood_requires_agency_approval"
  | "separation_source_text"
  | "preemption_policy"
>;

const CONTRACT_DOCUMENTS_BUCKET = "underwriting-documents";

export type ProposeResult =
  { ok: true; proposal: AgreementProposal; revisionId: string } | { ok: false; error: string };

function contentTypeForPath(path: string): string | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return null;
}

/** The revision the schedule step is entering lines under: a draft when one is open, else the current one. */
function targetRevision(contract: NonNullable<Awaited<ReturnType<typeof getContractDetail>>>) {
  return contract.draftRevision ?? contract.currentRevision;
}

export async function proposeScheduleFromAgreement(contractId: string): Promise<ProposeResult> {
  await assertUnderwritingAccess();
  const contract = await getContractDetail(contractId);
  if (!contract) return { ok: false, error: "That contract no longer exists." };
  if (!contract.agreement_document_path)
    return { ok: false, error: "Attach the signed agreement first, on the Policy tab." };
  const revision = targetRevision(contract);
  if (!revision) return { ok: false, error: "This contract has no revision to add lines to." };
  if (!canRewriteScheduleLine({ contractStatus: contract.status, revisionStatus: revision.status }))
    return {
      ok: false,
      error:
        "Lines can only be read in while the contract is a draft, or into a draft revision — this schedule already schedules credits.",
    };

  const contentType = contentTypeForPath(contract.agreement_document_path);
  if (!contentType)
    return { ok: false, error: "The attached agreement isn't a PDF, PNG, or JPEG." };

  const supabase = await createClient();
  const { data: file, error: downloadError } = await supabase.storage
    .from(CONTRACT_DOCUMENTS_BUCKET)
    .download(contract.agreement_document_path);
  if (downloadError || !file) {
    console.error("Could not download the contract document", downloadError);
    return { ok: false, error: "Could not read the attached agreement from storage." };
  }

  const [pools, programs] = await Promise.all([listInventoryPools(), listProgramOptions()]);
  const activePools = pools.filter((pool) => pool.active);
  const activeFlights = contract.flights.filter((flight) => flight.status === "active");

  const read = await readAgreementWithAI({
    document: {
      bytes: new Uint8Array(await file.arrayBuffer()),
      filename: contract.agreement_document_path.split("/").pop() ?? "agreement",
      contentType,
    },
    poolNames: activePools.map((pool) => pool.name),
    programNames: programs.map((program) => program.name),
    contract: {
      underwriterName: contract.underwriter.name,
      contractIdentifier: contract.contract_identifier,
      effectiveFrom: contract.effective_from,
      effectiveTo: contract.effective_to,
    },
  });
  if (!read.ok) return read;

  const proposal = proposeScheduleFromModelOutput(read.output, {
    pools: activePools.map((pool) => ({ id: pool.id, name: pool.name })),
    programs: programs.map((program) => ({ id: program.id, name: program.name })),
    flights: activeFlights.map((flight) => ({ id: flight.id, name: flight.name })),
    contract: {
      effective_from: contract.effective_from,
      effective_to: contract.effective_to,
      stated_total_spots: contract.stated_total_spots,
      sponsorship_total: contract.sponsorship_total,
      affidavit_required: contract.affidavit_required,
      makegood_requires_agency_approval: contract.makegood_requires_agency_approval,
      separation_source_text: contract.separation_source_text,
      preemption_policy: contract.preemption_policy,
    },
  });
  return { ok: true, proposal, revisionId: revision.id };
}

export interface ApplyLineInput {
  values: ScheduleLineFormValues;
  /** A flight to create first, when the order names one the contract doesn't have. */
  newFlight: ProposedFlight | null;
}

export interface ApplyOrderUpdateInput {
  field: OrderUpdateField;
  value: string | number | boolean;
}

export interface ApplyAgreementInput {
  contractId: string;
  revisionId: string;
  lines: ApplyLineInput[];
  orderUpdates: ApplyOrderUpdateInput[];
}

export type ApplyResult =
  | { ok: true; linesAdded: number; flightsCreated: number; orderFieldsUpdated: number }
  | { ok: false; error: string };

const ORDER_UPDATE_FIELDS: OrderUpdateField[] = [
  "effective_from",
  "effective_to",
  "stated_total_spots",
  "sponsorship_total",
  "affidavit_required",
  "makegood_requires_agency_approval",
  "separation_source_text",
  "preemption_policy",
];

/** The typed column write for one proposed order fact, or null when the value isn't the shape the column takes. */
function orderUpdateColumn(update: ApplyOrderUpdateInput): ContractOrderColumns | null {
  switch (update.field) {
    case "effective_from":
    case "effective_to":
      return typeof update.value === "string" && isValidDateISO(update.value)
        ? { [update.field]: update.value }
        : null;
    case "stated_total_spots":
      return typeof update.value === "number" && Number.isInteger(update.value) && update.value >= 0
        ? { stated_total_spots: update.value }
        : null;
    case "sponsorship_total":
      return typeof update.value === "number" && Number.isFinite(update.value)
        ? { sponsorship_total: update.value }
        : null;
    case "affidavit_required":
    case "makegood_requires_agency_approval":
      return update.value === true ? { [update.field]: true } : null;
    case "separation_source_text":
    case "preemption_policy":
      return typeof update.value === "string" && update.value.trim() !== ""
        ? { [update.field]: update.value.trim() }
        : null;
  }
}

export async function applyAgreementProposal(input: ApplyAgreementInput): Promise<ApplyResult> {
  const { profile } = await assertUnderwritingAccess();
  const contract = await getContractDetail(input.contractId);
  if (!contract) return { ok: false, error: "That contract no longer exists." };
  const revision = contract.revisions.find((candidate) => candidate.id === input.revisionId);
  if (!revision || (revision.status !== "current" && revision.status !== "draft"))
    return { ok: false, error: "Lines can only be added to the current revision or a draft." };
  if (!canRewriteScheduleLine({ contractStatus: contract.status, revisionStatus: revision.status }))
    return {
      ok: false,
      error: "This schedule already schedules credits — enter changes as a revision instead.",
    };
  if (input.lines.length === 0 && input.orderUpdates.length === 0)
    return { ok: false, error: "Nothing was selected." };

  // Parse everything before writing anything, so a bad line stops the whole
  // batch rather than leaving half of it in.
  const parsedLines = input.lines.map((line, index) => ({
    index,
    parsed: parseScheduleLineForm(line.values),
    newFlight: line.newFlight,
  }));
  const failed = parsedLines.find((line) => !line.parsed.ok);
  if (failed && !failed.parsed.ok)
    return {
      ok: false,
      error: `Line ${failed.index + 1} can't be saved as read: ${failed.parsed.error}`,
    };

  const supabase = await createClient();

  // The pool/program intersection rule the editor and addScheduleLine both
  // enforce: a line naming a program its pool never targets could never place.
  const poolIds = [
    ...new Set(
      parsedLines.flatMap((line) =>
        line.parsed.ok && line.parsed.value.line.pool_id && line.parsed.value.line.program_id
          ? [line.parsed.value.line.pool_id]
          : [],
      ),
    ),
  ];
  if (poolIds.length > 0) {
    const { data: targets, error } = await supabase
      .from("uw_inventory_pool_targets")
      .select("pool_id, program_id")
      .in("pool_id", poolIds);
    if (error) return { ok: false, error: "Could not read the pools' targets." };
    for (const line of parsedLines) {
      if (!line.parsed.ok) continue;
      const { pool_id, program_id } = line.parsed.value.line;
      if (!pool_id || !program_id) continue;
      const poolTargets = (targets ?? []).filter((target) => target.pool_id === pool_id);
      if (!poolPermitsProgram(poolTargets, program_id))
        return {
          ok: false,
          error: `Line ${line.index + 1} names a program its pool never places into — pick one or the other, then add it by hand.`,
        };
    }
  }

  // Flights the order names that the contract doesn't have yet, one row each
  // however many lines share it; an existing flight of the same name is reused.
  const flightIdByName = new Map(
    contract.flights
      .filter((flight) => flight.status === "active")
      .map((flight) => [flight.name.trim().toLowerCase(), flight.id]),
  );
  let flightsCreated = 0;
  for (const line of parsedLines) {
    const flight = line.newFlight;
    if (!flight) continue;
    const key = flight.name.trim().toLowerCase();
    if (key === "" || flightIdByName.has(key)) continue;
    if (
      !isValidDateISO(flight.start_date) ||
      !isValidDateISO(flight.end_date) ||
      flight.end_date < flight.start_date
    )
      return { ok: false, error: `The flight "${flight.name}" has no usable dates.` };
    const { data, error } = await supabase
      .from("uw_contract_flights")
      .insert({
        contract_id: contract.id,
        name: flight.name.trim(),
        start_date: flight.start_date,
        end_date: flight.end_date,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (error || !data)
      return { ok: false, error: `Could not create the flight "${flight.name}".` };
    flightIdByName.set(key, data.id);
    flightsCreated += 1;
  }

  let linesAdded = 0;
  for (const line of parsedLines) {
    if (!line.parsed.ok) continue;
    const flightId = line.newFlight
      ? (flightIdByName.get(line.newFlight.name.trim().toLowerCase()) ?? null)
      : line.parsed.value.line.flight_id;
    const inserted = await insertScheduleLineWithBuckets(
      supabase,
      { contractId: contract.id, revisionId: revision.id, createdBy: profile.id },
      { ...line.parsed.value, line: { ...line.parsed.value.line, flight_id: flightId } },
    );
    if (!inserted.ok)
      return {
        ok: false,
        error: `${inserted.error} (${linesAdded} of ${parsedLines.length} lines were added before this.)`,
      };
    linesAdded += 1;
  }

  let orderFieldsUpdated = 0;
  const columns: ContractOrderColumns = {};
  for (const update of input.orderUpdates) {
    if (!ORDER_UPDATE_FIELDS.includes(update.field)) continue;
    const column = orderUpdateColumn(update);
    if (column) {
      Object.assign(columns, column);
      orderFieldsUpdated += 1;
    }
  }
  if (orderFieldsUpdated > 0) {
    const { error } = await supabase.from("uw_contracts").update(columns).eq("id", contract.id);
    if (error) {
      console.error("Could not update the contract's order facts", error);
      return {
        ok: false,
        error: `Added ${linesAdded} lines, but could not update the order's facts: ${error.message}`,
      };
    }
  }

  await logAuditEvent({
    actorId: profile.id,
    action: "underwriting.contract.schedule_read_from_agreement",
    targetType: "uw_contract",
    targetId: contract.id,
    metadata: {
      revision_id: revision.id,
      lines_added: linesAdded,
      flights_created: flightsCreated,
      order_fields_updated: Object.keys(columns),
    },
  });

  const base = `/underwriting/contracts/${contract.id}`;
  revalidatePath(base);
  revalidatePath(`${base}/schedule`);
  revalidatePath("/underwriting/contracts");
  return { ok: true, linesAdded, flightsCreated, orderFieldsUpdated };
}
