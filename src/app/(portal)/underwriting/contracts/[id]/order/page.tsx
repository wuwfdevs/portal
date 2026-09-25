import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import { getContractDetail } from "@/lib/underwriting/queries";
import { updateContractOrder } from "../../../contract-actions";
import { WizardHeader } from "../wizard-header";

/** Setup step 1 for a contract that already exists — the same facts the new-contract form collects, editable. */
export default async function ContractOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const contract = await getContractDetail(id);
  if (!contract) notFound();

  return (
    <div>
      <WizardHeader
        contract={{
          id: contract.id,
          underwriterName: contract.underwriter.name,
          identifier: contract.contract_identifier,
          effectiveFrom: contract.effective_from,
          effectiveTo: contract.effective_to,
          status: contract.status,
        }}
        current={0}
      />
      <form action={updateContractOrder} className="flex w-full max-w-2xl flex-col gap-5">
        <input type="hidden" name="contract_id" value={contract.id} />
        <input type="hidden" name="return_to" value="order" />
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="contract_identifier">Order or insertion order number</Label>
            <Input
              id="contract_identifier"
              name="contract_identifier"
              required
              maxLength={120}
              defaultValue={contract.contract_identifier}
            />
          </div>
          <div>
            <Label htmlFor="sponsorship_total">Sponsorship total ($)</Label>
            <Input
              id="sponsorship_total"
              name="sponsorship_total"
              type="number"
              step="0.01"
              min={0}
              defaultValue={contract.sponsorship_total ?? ""}
            />
          </div>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-ink-700">Runs</legend>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="effective_from" className="font-normal text-ink-500">
                From
              </Label>
              <Input
                id="effective_from"
                name="effective_from"
                type="date"
                required
                defaultValue={contract.effective_from}
              />
            </div>
            <div>
              <Label htmlFor="effective_to" className="font-normal text-ink-500">
                To
              </Label>
              <Input
                id="effective_to"
                name="effective_to"
                type="date"
                defaultValue={contract.effective_to ?? ""}
              />
            </div>
          </div>
          <FieldHint>
            Changing the dates does not move the lines already entered — check them on the schedule
            step.
          </FieldHint>
        </fieldset>
        <div>
          <Label htmlFor="sponsorship_category">Sponsorship category</Label>
          <Input
            id="sponsorship_category"
            name="sponsorship_category"
            defaultValue={contract.sponsorship_category ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" rows={3} defaultValue={contract.notes ?? ""} />
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <Button type="submit">Save and continue to schedule</Button>
        </div>
      </form>
    </div>
  );
}
