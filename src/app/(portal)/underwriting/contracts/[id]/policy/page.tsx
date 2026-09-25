import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { getContractDetail, listCopy } from "@/lib/underwriting/queries";
import {
  linkCopyToContract,
  unlinkCopyFromContract,
  updateContractPolicy,
} from "../../../contract-actions";
import { createCopy } from "../../../copy-actions";
import { WizardHeader } from "../wizard-header";

/**
 * Setup step 3: the messages this contract will air and the traffic policy
 * the order states (docs/underwriting-traffic-redesign.md §11). Both are
 * the same actions the contract page offers; this screen only puts them
 * where a staffer setting up an order reaches them in turn.
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
  const [contract, allCopy] = await Promise.all([getContractDetail(id), listCopy()]);
  if (!contract) notFound();
  const linkedIds = new Set(contract.copy.map((item) => item.id));
  const linkable = allCopy.filter((item) => !linkedIds.has(item.id));

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
        current={2}
      />
      {error && <Alert className="mb-4">{error}</Alert>}

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <section className="rounded border border-line">
            <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
              Copy · {contract.copy.length} linked
            </div>
            {contract.copy.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink-500">
                No copy yet. Create the first message below, or link one that already exists.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {contract.copy.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <Link
                      href={`/underwriting/copy/${item.id}`}
                      className="font-semibold text-brand-link"
                    >
                      {item.label}
                    </Link>
                    <span className="text-xs text-ink-500">
                      {item.execution_kind === "live_read" ? "live read" : "recorded"}
                      {item.duration_seconds != null && ` · ${item.duration_seconds}s`}
                    </span>
                    <Badge variant={item.approval_status === "approved" ? "success" : "warning"}>
                      {item.approval_status}
                    </Badge>
                    <span className="flex-1" />
                    <form action={unlinkCopyFromContract}>
                      <input type="hidden" name="contract_id" value={contract.id} />
                      <input type="hidden" name="copy_id" value={item.id} />
                      <input type="hidden" name="return_to" value="policy" />
                      <Button type="submit" variant="ghost">
                        Unlink
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form
              action={createCopy}
              className="flex flex-col gap-4 border-t border-line px-5 py-4"
            >
              <input type="hidden" name="contract_id" value={contract.id} />
              <input type="hidden" name="return_to" value="policy" />
              <div className="text-xs font-bold uppercase tracking-wider text-ink-500">
                New message
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="label">Label</Label>
                  <Input id="label" name="label" required maxLength={80} placeholder="Message A" />
                </div>
                <div>
                  <Label htmlFor="execution_kind">Execution</Label>
                  <Select id="execution_kind" name="execution_kind" defaultValue="live_read">
                    <option value="live_read">Live read</option>
                    <option value="recorded">Recorded (via DAD)</option>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="script">Script</Label>
                <Textarea id="script" name="script" rows={3} />
                <FieldHint>
                  A live read&apos;s length is estimated from its words when the duration is left
                  blank.
                </FieldHint>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="duration_seconds_copy">Duration (s)</Label>
                  <Input id="duration_seconds_copy" name="duration_seconds" type="number" min={1} />
                </div>
                <div>
                  <Label htmlFor="cart_identifier">DAD cart #</Label>
                  <Input id="cart_identifier" name="cart_identifier" />
                </div>
                <div>
                  <Label htmlFor="effective_from_copy">Effective from</Label>
                  <Input id="effective_from_copy" name="effective_from" type="date" />
                </div>
              </div>
              <div>
                <Button type="submit" variant="secondary">
                  Create and link
                </Button>
              </div>
            </form>
            {linkable.length > 0 && (
              <form
                action={linkCopyToContract}
                className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-4"
              >
                <input type="hidden" name="contract_id" value={contract.id} />
                <input type="hidden" name="return_to" value="policy" />
                <Select name="copy_id" defaultValue="" className="max-w-xs">
                  <option value="" disabled>
                    Or link existing copy…
                  </option>
                  {linkable.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </Select>
                <Button type="submit" variant="secondary">
                  Link
                </Button>
              </form>
            )}
          </section>

          <section className="rounded border border-line">
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
                <label className="flex items-center gap-2 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    name="affidavit_required"
                    className="h-4 w-4"
                    defaultChecked={contract.affidavit_required}
                  />
                  Affidavit required
                </label>
                <label className="flex items-center gap-2 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    name="makegood_requires_agency_approval"
                    className="h-4 w-4"
                    defaultChecked={contract.makegood_requires_agency_approval}
                  />
                  Makegoods need agency approval
                </label>
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
                <span className="flex-1" />
                <Link
                  href={`/underwriting/contracts/${contract.id}`}
                  className="inline-flex items-center justify-center rounded bg-brand-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-[#2278B8]"
                >
                  Continue to review
                </Link>
              </div>
            </form>
          </section>
        </div>

        <aside
          aria-label="About this step"
          className="w-full shrink-0 rounded border border-line bg-panel-50 px-5 py-4 lg:w-80"
        >
          <div className="text-[13px] font-bold text-ink-900">Copy is approved on its own page</div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-700">
            A new message starts as a draft. Auto-fill and manual placement only use approved copy,
            so a contract can be activated before every message is approved — nothing places until
            one is.
          </p>
        </aside>
      </div>
    </div>
  );
}
