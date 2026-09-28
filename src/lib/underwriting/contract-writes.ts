import "server-only";
// The one write path for a new contract: the draft uw_contracts row and
// its first revision, created `current` at once (the contract itself is
// the draft — docs/underwriting-traffic-redesign.md §11.4). Shared by the
// order step's createContract and creating a contract from its agreement
// (§12), so a contract read from a document starts exactly the way a
// hand-entered one does.

import type { createClient } from "@/lib/supabase/server";
import { stationTodayISO } from "@/lib/log/timezone";
import type { DraftContractFacts } from "./agreement-import";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export type CreateDraftContractResult =
  { ok: true; id: string; revisionId: string } | { ok: false; error: string };

export async function createDraftContractWithRevision(
  supabase: ServerSupabase,
  createdBy: string,
  facts: DraftContractFacts & {
    id?: string;
    agreement_document_path?: string | null;
    account_rep?: string | null;
  },
): Promise<CreateDraftContractResult> {
  const { data, error } = await supabase
    .from("uw_contracts")
    .insert({
      ...(facts.id ? { id: facts.id } : {}),
      underwriter_id: facts.underwriter_id,
      contract_identifier: facts.contract_identifier,
      effective_from: facts.effective_from,
      effective_to: facts.effective_to,
      affidavit_required: facts.affidavit_required,
      sponsorship_category: facts.sponsorship_category,
      sponsorship_total: facts.sponsorship_total,
      stated_total_spots: facts.stated_total_spots,
      preemption_policy: facts.preemption_policy,
      makegood_requires_agency_approval: facts.makegood_requires_agency_approval,
      separation_source_text: facts.separation_source_text,
      notes: facts.notes,
      account_rep: facts.account_rep ?? null,
      agreement_document_path: facts.agreement_document_path ?? null,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) {
    console.error("Could not create the contract", error);
    return { ok: false, error: `Could not create the contract: ${error.message}` };
  }
  if (!data) return { ok: false, error: "Could not create the contract." };

  const { data: revision, error: revisionError } = await supabase
    .from("uw_contract_revisions")
    .insert({
      contract_id: data.id,
      revision_label: "Original order",
      effective_from: facts.effective_from,
      received_at: stationTodayISO(),
      status: "current",
      activated_at: new Date().toISOString(),
      activated_by: createdBy,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (revisionError || !revision) {
    console.error("Created the contract but not its first revision", revisionError);
    return {
      ok: false,
      error: `Created the contract but not its first revision: ${revisionError?.message ?? "no row returned"}`,
    };
  }
  return { ok: true, id: data.id, revisionId: revision.id };
}
