import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, CheckboxField } from "@/components/ui/input";
import { getContractDetail } from "@/lib/underwriting/queries";
import { updateContractPolicy } from "../../../contract-actions";
import { WizardHeader } from "../wizard-header";
import { PrimaryLink, TextLink } from "@/components/ui/primary-link";
import { Card } from "@/components/ui/card";

/**
 * Setup step 4: the traffic policy the order states (docs/underwriting-
 * traffic-redesign.md §11; copy moved to its own step 3 in §13). The same
 * action the contract page's Agreement tab offers; this screen only puts it
 * where a staffer setting up an order reaches it in turn.
 */
export default async function ContractPolicyPage({
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
        current={3}
      />
      {error && <Alert className="mb-4">{error}</Alert>}

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <Card>
            <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
              Traffic policy
            </div>
            <form action={updateContractPolicy} className="flex flex-col gap-4 p-5">
              <input type="hidden" name="contract_id" value={contract.id} />
              <input type="hidden" name="return_to" value="policy" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="stated_total_spots">Total spots on the order</Label>
                  <Input
                    id="stated_total_spots"
                    name="stated_total_spots"
                    type="number"
                    min={0}
                    defaultValue={contract.stated_total_spots ?? ""}
                  />
                  <FieldHint>
                    Checked against what the lines compile to — never the scheduling target.
                  </FieldHint>
                </div>
                <div>
                  <Label htmlFor="preemption_policy">Preemption / makegood policy</Label>
                  <Input
                    id="preemption_policy"
                    name="preemption_policy"
                    placeholder="Rescheduled within the program originally sponsored"
                    defaultValue={contract.preemption_policy ?? ""}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <CheckboxField
                  name="affidavit_required"
                  defaultChecked={contract.affidavit_required}
                  label="Affidavit required"
                />
                <CheckboxField
                  name="makegood_requires_agency_approval"
                  defaultChecked={contract.makegood_requires_agency_approval}
                  label="Makegoods need agency approval"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="separation_source_text">Separation, as the order prints it</Label>
                  <Input
                    id="separation_source_text"
                    name="separation_source_text"
                    placeholder='e.g. "3"'
                    defaultValue={contract.separation_source_text ?? ""}
                  />
                </div>
                <div>
                  <Label htmlFor="separation_policy">Separation policy</Label>
                  <Select
                    id="separation_policy"
                    name="separation_policy"
                    defaultValue={contract.separation_policy}
                  >
                    <option value="unspecified">Undecided (blocks auto-fill if stated)</option>
                    <option value="none">None beyond the standard rules</option>
                    <option value="min_minutes">At least N minutes apart on a day</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="separation_minutes">Minutes apart</Label>
                  <Input
                    id="separation_minutes"
                    name="separation_minutes"
                    type="number"
                    min={1}
                    defaultValue={contract.separation_minutes ?? ""}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                <Button type="submit" variant="secondary">
                  Save policy
                </Button>
                <TextLink href={`/underwriting/contracts/${contract.id}/copy`}>
                  ← Back to copy
                </TextLink>
                <span className="flex-1" />
                <PrimaryLink href={`/underwriting/contracts/${contract.id}`}>
                  Continue to review
                </PrimaryLink>
              </div>
            </form>
          </Card>
        </div>

        <aside
          aria-label="About this step"
          className="w-full shrink-0 rounded border border-line bg-panel-50 px-5 py-4 lg:w-80"
        >
          <div className="text-[13px] font-bold text-ink-900">Warnings never block activation</div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-700">
            Save what the order states. A separation rule printed with no unit keeps auto-fill
            waiting until a policy is chosen, and a stated total that disagrees with the lines is
            flagged on the review step — neither stops the contract being activated.
          </p>
        </aside>
      </div>
    </div>
  );
}
