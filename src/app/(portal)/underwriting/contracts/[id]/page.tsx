import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select } from "@/components/ui/input";
import { getContractDetail, listCopy } from "@/lib/underwriting/queries";
import {
  addObligation,
  linkCopyToContract,
  setContractStatus,
  setObligationStatus,
  unlinkCopyFromContract,
} from "../../contract-actions";
import type { UwContractStatus, UwObligationStatus } from "@/lib/database.types";

const CONTRACT_STATUS_VARIANT: Record<UwContractStatus, BadgeVariant> = {
  draft: "neutral",
  active: "success",
  expired: "muted",
  terminated: "danger",
};

const OBLIGATION_STATUS_VARIANT: Record<UwObligationStatus, BadgeVariant> = {
  active: "success",
  fulfilled: "accent",
  at_risk: "danger",
};

export default async function ContractDetailPage({
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

  const allCopy = await listCopy();
  const linkedCopyIds = new Set(contract.copy.map((item) => item.id));
  const linkableCopy = allCopy.filter((item) => !linkedCopyIds.has(item.id));

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <Link href="/underwriting/contracts" className="text-xs font-semibold text-brand-link">
          ← Back to contracts
        </Link>
        <div className="mt-2 mb-1 flex flex-wrap items-center gap-2.5">
          <h2 className="font-serif text-xl font-bold text-ink-900">{contract.underwriter_name}</h2>
          <Badge variant={CONTRACT_STATUS_VARIANT[contract.status]}>{contract.status}</Badge>
        </div>
        <p className="mb-4 text-xs text-ink-500">
          {contract.contract_identifier} · {contract.effective_from}
          {contract.effective_to ? ` – ${contract.effective_to}` : ""}
        </p>

        {error && <Alert className="mb-4">{error}</Alert>}
        {contract.notes && <p className="mb-4 text-sm text-ink-700">{contract.notes}</p>}

        <div className="rounded border border-line">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
            Placement obligations
          </div>
          {contract.obligations.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-500">No obligations yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {contract.obligations.map((obligation) => (
                <li key={obligation.id} className="flex flex-col gap-2 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-ink-900">{obligation.description}</span>
                    <Badge variant={OBLIGATION_STATUS_VARIANT[obligation.status]}>{obligation.status}</Badge>
                  </div>
                  <p className="text-xs text-ink-500">
                    {obligation.quantity_required} / {obligation.quantity_period.replace("_", " ")} ·{" "}
                    {obligation.duration_seconds}s
                    {obligation.sponsorship_position ? ` · ${obligation.sponsorship_position}` : ""}
                    {obligation.eligible_daypart ? ` · ${obligation.eligible_daypart}` : ""}
                  </p>
                  {obligation.distribution_rule && (
                    <p className="text-xs text-ink-400">{obligation.distribution_rule}</p>
                  )}
                  <form action={setObligationStatus} className="flex items-center gap-2">
                    <input type="hidden" name="obligation_id" value={obligation.id} />
                    <input type="hidden" name="contract_id" value={contract.id} />
                    <Select name="status" defaultValue={obligation.status} className="max-w-[160px]">
                      <option value="active">Active</option>
                      <option value="fulfilled">Fulfilled</option>
                      <option value="at_risk">At risk</option>
                    </Select>
                    <Button type="submit" variant="ghost">
                      Update
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <details className="border-t border-line px-5 py-4">
            <summary className="cursor-pointer text-xs font-semibold text-brand-link">Add an obligation</summary>
            <form action={addObligation} className="mt-4 flex flex-col gap-4">
              <input type="hidden" name="contract_id" value={contract.id} />
              <div>
                <Label htmlFor="description">Description</Label>
                <Input id="description" name="description" required maxLength={200} />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="quantity_required">Quantity required</Label>
                  <Input id="quantity_required" name="quantity_required" type="number" required min={1} />
                </div>
                <div>
                  <Label htmlFor="quantity_period">Period</Label>
                  <Select id="quantity_period" name="quantity_period" defaultValue="monthly">
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="campaign_total">Campaign total</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="duration_seconds">Duration (s)</Label>
                  <Input id="duration_seconds" name="duration_seconds" type="number" required min={1} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="sponsorship_position">Sponsorship position</Label>
                  <Select id="sponsorship_position" name="sponsorship_position" defaultValue="">
                    <option value="">—</option>
                    <option value="opening">Opening</option>
                    <option value="closing">Closing</option>
                    <option value="mid">Mid</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="eligible_daypart">Eligible daypart</Label>
                  <Input id="eligible_daypart" name="eligible_daypart" placeholder="Morning drive" />
                </div>
              </div>
              <div>
                <Label htmlFor="distribution_rule">Distribution guidance</Label>
                <Input
                  id="distribution_rule"
                  name="distribution_rule"
                  placeholder="No more than one per hour"
                />
                <FieldHint>Free text — advisory, not enforced. See docs/underwriting-design.md §7.</FieldHint>
              </div>
              <div className="flex gap-3">
                <div>
                  <Label htmlFor="start_date">Start date</Label>
                  <Input id="start_date" name="start_date" type="date" required />
                </div>
                <div>
                  <Label htmlFor="end_date">End date</Label>
                  <Input id="end_date" name="end_date" type="date" />
                </div>
              </div>
              <div>
                <Label htmlFor="eligible_program_ids">Eligible program IDs</Label>
                <Input id="eligible_program_ids" name="eligible_program_ids" placeholder="uuid, uuid" />
                <FieldHint>
                  Comma-separated Log program IDs. Leave blank if eligible everywhere. A picker by name
                  needs a scoped read into Log&apos;s program list, which isn&apos;t built until the placement
                  slice — see docs/underwriting-design.md §6.
                </FieldHint>
              </div>
              <div className="flex justify-end">
                <Button type="submit">Add obligation</Button>
              </div>
            </form>
          </details>
        </div>

        <div className="mt-6 rounded border border-line">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">Linked copy</div>
          {contract.copy.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-500">No copy linked yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {contract.copy.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
                  <Link href={`/underwriting/copy/${item.id}`} className="font-semibold text-brand-link">
                    {item.cart_identifier ?? "(no cart #)"}
                  </Link>
                  <form action={unlinkCopyFromContract}>
                    <input type="hidden" name="contract_id" value={contract.id} />
                    <input type="hidden" name="copy_id" value={item.id} />
                    <Button type="submit" variant="ghost">
                      Unlink
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          {linkableCopy.length > 0 && (
            <form action={linkCopyToContract} className="flex items-center gap-2 border-t border-line px-5 py-4">
              <input type="hidden" name="contract_id" value={contract.id} />
              <Select name="copy_id" defaultValue="" className="max-w-[220px]">
                <option value="" disabled>
                  Choose copy to link…
                </option>
                {linkableCopy.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.cart_identifier ?? item.id.slice(0, 8)}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="secondary">
                Link
              </Button>
            </form>
          )}
        </div>
      </div>

      <div className="w-full shrink-0 rounded border border-line lg:w-72">
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">Status</div>
        <form action={setContractStatus} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="contract_id" value={contract.id} />
          <Select name="status" defaultValue={contract.status}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="terminated">Terminated</option>
          </Select>
          <Button type="submit">Update status</Button>
        </form>
      </div>
    </div>
  );
}
