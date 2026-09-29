"use server";

// Creating a contract from its signed agreement (docs/underwriting-traffic-
// redesign.md §12): the order step's second submit. What the staffer typed
// on the step wins and the reading fills the rest; everything from the
// model call to the audit event is lib/underwriting/agreement-import-
// service.ts's importAgreementAsDraft — the same path the legacy-agreement
// migration (§14) runs each manifest entry through. Lands on the schedule
// step, where the saved lines are reviewed like any other: edited,
// removed, or left alone.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { failWith } from "@/lib/editorial/action-result";
import type { TypedOrderFields } from "@/lib/underwriting/agreement-import";
import {
  agreementDocumentFromFile,
  importAgreementAsDraft,
} from "@/lib/underwriting/agreement-import-service";

const NEW_CONTRACT_PATH = "/underwriting/contracts/new";

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

export async function createContractFromAgreement(formData: FormData): Promise<void> {
  const { profile } = await assertUnderwritingAccess();

  const upload = await agreementDocumentFromFile(formData.get("agreement_file"));
  if (!upload.ok) failWith(NEW_CONTRACT_PATH, upload.error);

  const typed: TypedOrderFields = {
    underwriter_id: field(formData, "underwriter_id"),
    contract_identifier: field(formData, "contract_identifier"),
    effective_from: field(formData, "effective_from"),
    effective_to: field(formData, "effective_to"),
    sponsorship_total: field(formData, "sponsorship_total"),
    sponsorship_category: field(formData, "sponsorship_category"),
    notes: field(formData, "notes"),
  };

  const supabase = await createClient();
  const imported = await importAgreementAsDraft(supabase, profile.id, {
    document: upload.document,
    typed,
    // Not something the reading looks for — kept from the form if typed.
    accountRep: field(formData, "account_rep") || null,
  });
  if (!imported.ok) failWith(NEW_CONTRACT_PATH, imported.error);

  revalidatePath("/underwriting/contracts");
  redirect(`/underwriting/contracts/${imported.contractId}/schedule`);
}
