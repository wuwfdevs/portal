import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select } from "@/components/ui/input";
import { listContracts } from "@/lib/underwriting/queries";
import { generateAffidavit } from "../../affidavit-actions";

/** Workflow G's own generation form (docs/underwriting-design.md §4) — pick a contract and a campaign period; the assembled evidence and its line items are built server-side by generateAffidavit. */
export default async function NewAffidavitPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const contracts = await listContracts();

  return (
    <div className="max-w-lg">
      <Link href="/underwriting/affidavits" className="text-xs font-semibold text-brand-link">
        ← Back to affidavits
      </Link>
      <div className="mt-3 rounded border border-line">
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">Generate an affidavit</div>
        <form action={generateAffidavit} className="flex flex-col gap-4 p-5">
          {error && <Alert>{error}</Alert>}
          <div>
            <Label htmlFor="contract_id">Contract</Label>
            <Select id="contract_id" name="contract_id" defaultValue="" required>
              <option value="" disabled>
                Choose a contract…
              </option>
              {contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.underwriter_name} — {contract.contract_identifier}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-3">
            <div>
              <Label htmlFor="campaign_period_start">Period start</Label>
              <Input id="campaign_period_start" name="campaign_period_start" type="date" required />
            </div>
            <div>
              <Label htmlFor="campaign_period_end">Period end</Label>
              <Input id="campaign_period_end" name="campaign_period_end" type="date" required />
            </div>
          </div>
          <FieldHint>
            Assembles every verified air date, actual duration, and exception from this contract&apos;s
            broadcast events in the period. Regenerating for the same contract and period is fine — it
            produces a new, separately versioned affidavit rather than replacing the old one.
          </FieldHint>
          <div className="flex justify-end border-t border-line pt-4">
            <Button type="submit">Generate</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
