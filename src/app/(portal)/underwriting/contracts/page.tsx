import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { listContracts, listUnderwriters } from "@/lib/underwriting/queries";
import { createContract } from "../contract-actions";
import type { UwContractStatus } from "@/lib/database.types";

const STATUS_VARIANT: Record<UwContractStatus, BadgeVariant> = {
  draft: "neutral",
  active: "success",
  expired: "muted",
  terminated: "danger",
};

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [contracts, underwriters] = await Promise.all([listContracts(), listUnderwriters()]);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        {contracts.length === 0 ? (
          <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
            No contracts yet.
          </div>
        ) : (
          <TableFrame>
            <Table>
              <thead>
                <HeaderRow>
                  <Th>Underwriter</Th>
                  <Th>Contract #</Th>
                  <Th>Effective</Th>
                  <Th>Status</Th>
                </HeaderRow>
              </thead>
              <tbody>
                {contracts.map((contract) => (
                  <Row key={contract.id}>
                    <Cell className="font-semibold text-ink-900">
                      <Link href={`/underwriting/contracts/${contract.id}`} className="text-brand-link">
                        {contract.underwriter.name}
                      </Link>
                    </Cell>
                    <Cell className="text-ink-500">{contract.contract_identifier}</Cell>
                    <Cell className="whitespace-nowrap text-ink-500">
                      {contract.effective_from}
                      {contract.effective_to ? ` – ${contract.effective_to}` : ""}
                    </Cell>
                    <Cell>
                      <Badge variant={STATUS_VARIANT[contract.status]}>{contract.status}</Badge>
                    </Cell>
                  </Row>
                ))}
              </tbody>
            </Table>
          </TableFrame>
        )}
      </div>

      <div className="w-full shrink-0 rounded border border-line lg:w-96">
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">New contract</div>
        <form action={createContract} className="flex flex-col gap-4 p-5">
          {error && <Alert>{error}</Alert>}
          <div>
            <Label htmlFor="underwriter_id">Underwriter</Label>
            {underwriters.length === 0 ? (
              <p className="text-xs text-ink-500">
                No underwriters yet —{" "}
                <Link href="/underwriting/underwriters" className="font-semibold text-brand-link">
                  create one first
                </Link>
                .
              </p>
            ) : (
              <Select id="underwriter_id" name="underwriter_id" required defaultValue="">
                <option value="" disabled>
                  Choose an underwriter…
                </option>
                {underwriters.map((underwriter) => (
                  <option key={underwriter.id} value={underwriter.id}>
                    {underwriter.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <div>
            <Label htmlFor="contract_identifier">Contract / insertion order #</Label>
            <Input id="contract_identifier" name="contract_identifier" required maxLength={120} />
          </div>
          <div className="flex gap-3">
            <div>
              <Label htmlFor="effective_from">Effective from</Label>
              <Input id="effective_from" name="effective_from" type="date" required />
            </div>
            <div>
              <Label htmlFor="effective_to">Effective to</Label>
              <Input id="effective_to" name="effective_to" type="date" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sponsorship_category">Sponsorship category</Label>
              <Input id="sponsorship_category" name="sponsorship_category" placeholder="Real Estate Services" />
            </div>
            <div>
              <Label htmlFor="sponsorship_total">Sponsorship total ($)</Label>
              <Input id="sponsorship_total" name="sponsorship_total" type="number" step="0.01" min={0} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" name="affidavit_required" className="h-4 w-4" />
            Affidavit required
          </label>
          <FieldHint>Most WUWF agreements do not require one — leave unchecked unless the contract says so.</FieldHint>
          <div>
            <Label htmlFor="preemption_policy">Preemption / makegood policy</Label>
            <Input
              id="preemption_policy"
              name="preemption_policy"
              placeholder="Rescheduled within the program originally sponsored"
            />
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={3} />
          </div>
          <div className="flex justify-end border-t border-line pt-4">
            <Button type="submit">Create contract</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
