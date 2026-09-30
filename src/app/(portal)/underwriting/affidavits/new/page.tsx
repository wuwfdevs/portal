import { orderNumberLabel } from "@/lib/underwriting/contract-label";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { listContracts } from "@/lib/underwriting/queries";
import { generateAffidavit } from "../../affidavit-actions";

/**
 * Workflow G's own generation form (docs/underwriting-design.md §4) — pick a
 * contract and a campaign period; the assembled evidence and its line items
 * are built server-side by generateAffidavit. `?contract=&start=&end=`
 * prefill it: the contract page's Affidavits panel links here that way, and a
 * failed generate returns here with what was entered.
 */
export default async function NewAffidavitPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; contract?: string; start?: string; end?: string }>;
}) {
  const { error, contract: contractId, start, end } = await searchParams;
  const contracts = await listContracts();
  const prefilled = contracts.find((contract) => contract.id === contractId) ?? null;
  const backHref = prefilled
    ? `/underwriting/contracts/${prefilled.id}`
    : "/underwriting/affidavits";

  return (
    <div className="max-w-lg">
      <Link href={backHref} className="text-xs font-semibold text-brand-link">
        {prefilled ? `← ${prefilled.underwriter.name}` : "← Back to affidavits"}
      </Link>
      <div className="mt-3 rounded border border-line">
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
          Generate an affidavit
        </div>
        <form action={generateAffidavit} className="flex flex-col gap-4 p-5">
          {error && <Alert>{error}</Alert>}
          <div>
            <Label htmlFor="contract_id">Contract</Label>
            <SearchableSelect
              id="contract_id"
              name="contract_id"
              required
              defaultValue={prefilled?.id}
              placeholder="Type the underwriter or order number…"
              options={contracts.map((contract) => ({
                id: contract.id,
                label: `${contract.underwriter.name} — ${orderNumberLabel(contract.contract_identifier)}`,
                hint: contract.status,
              }))}
            />
          </div>
          <div className="flex gap-3">
            <div>
              <Label htmlFor="campaign_period_start">Period start</Label>
              <Input
                id="campaign_period_start"
                name="campaign_period_start"
                type="date"
                required
                defaultValue={start}
              />
            </div>
            <div>
              <Label htmlFor="campaign_period_end">Period end</Label>
              <Input
                id="campaign_period_end"
                name="campaign_period_end"
                type="date"
                required
                defaultValue={end}
              />
            </div>
          </div>
          <FieldHint>
            Assembles every verified air date, actual duration, and exception from this
            contract&apos;s broadcast events in the period. Regenerating for the same contract and
            period is fine — it produces a new, separately versioned affidavit rather than replacing
            the old one.
          </FieldHint>
          <div className="flex justify-end border-t border-line pt-4">
            <Button type="submit">Generate</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
