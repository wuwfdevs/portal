import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { CopyAudioUpload } from "../../copy-audio-upload";
import { getCopyDetail } from "@/lib/underwriting/queries";
import { setCopyStatus, updateCopyDetails } from "../../copy-actions";
import type { UwCopyApprovalStatus } from "@/lib/database.types";

const APPROVAL_VARIANT: Record<UwCopyApprovalStatus, BadgeVariant> = {
  draft: "neutral",
  approved: "success",
  expired: "muted",
  retired: "muted",
};

export default async function CopyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const copy = await getCopyDetail(id);
  if (!copy) notFound();

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <Link href="/underwriting/copy" className="text-xs font-semibold text-brand-link">
          ← Back to copy library
        </Link>
        <div className="mt-2 mb-4 flex flex-wrap items-center gap-2.5">
          <h2 className="font-serif text-xl font-bold text-ink-900">{copy.cart_identifier ?? "(no cart #)"}</h2>
          <Badge variant={APPROVAL_VARIANT[copy.approval_status]}>{copy.approval_status}</Badge>
          <Badge variant={copy.production_status === "produced" ? "success" : "neutral"}>
            {copy.production_status}
          </Badge>
        </div>

        {error && <Alert className="mb-4">{error}</Alert>}

        <div className="rounded border border-line">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">Details</div>
          <form action={updateCopyDetails} className="flex flex-col gap-4 p-5">
            <input type="hidden" name="copy_id" value={copy.id} />
            <div>
              <Label htmlFor="cart_identifier">Cart #</Label>
              <Input id="cart_identifier" name="cart_identifier" defaultValue={copy.cart_identifier ?? ""} maxLength={120} />
            </div>
            <div>
              <Label htmlFor="script">Script</Label>
              <Textarea id="script" name="script" rows={5} defaultValue={copy.script ?? ""} />
            </div>
            <div className="flex gap-3">
              <div>
                <Label htmlFor="duration_seconds">Duration (s)</Label>
                <Input
                  id="duration_seconds"
                  name="duration_seconds"
                  type="number"
                  min={1}
                  className="w-32"
                  defaultValue={copy.duration_seconds ?? ""}
                />
                <FieldHint>No processing pipeline reads this from the file — set it by hand.</FieldHint>
              </div>
            </div>
            <div className="flex gap-3">
              <div>
                <Label htmlFor="effective_from">Effective from</Label>
                <Input id="effective_from" name="effective_from" type="date" required defaultValue={copy.effective_from} />
              </div>
              <div>
                <Label htmlFor="effective_to">Effective to</Label>
                <Input id="effective_to" name="effective_to" type="date" defaultValue={copy.effective_to ?? ""} />
              </div>
            </div>
            <div className="flex justify-end border-t border-line pt-4">
              <Button type="submit">Save details</Button>
            </div>
          </form>

          <div className="border-t border-line px-5 py-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">Audio</div>
            <CopyAudioUpload copyId={copy.id} hasExisting={Boolean(copy.audio_object_path)} />
          </div>
        </div>

        <div className="mt-6 rounded border border-line">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
            Linked contracts
          </div>
          {copy.contracts.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-500">
              Not linked to any contract yet — link it from the contract&apos;s own detail page.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {copy.contracts.map((contract) => (
                <li key={contract.id} className="px-5 py-3 text-sm">
                  <Link href={`/underwriting/contracts/${contract.id}`} className="font-semibold text-brand-link">
                    {contract.underwriter_name}
                  </Link>{" "}
                  <span className="text-ink-400">{contract.contract_identifier}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="w-full shrink-0 rounded border border-line lg:w-72">
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">Status</div>
        <form action={setCopyStatus} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="copy_id" value={copy.id} />
          <div>
            <Label htmlFor="approval_status">Approval status</Label>
            <Select id="approval_status" name="approval_status" defaultValue={copy.approval_status}>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="expired">Expired</option>
              <option value="retired">Retired</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="production_status">Production status</Label>
            <Select id="production_status" name="production_status" defaultValue={copy.production_status}>
              <option value="pending">Pending</option>
              <option value="produced">Produced</option>
            </Select>
          </div>
          <FieldHint>
            Expired or unapproved copy can&apos;t be scheduled without an explicit override, once placement
            exists.
          </FieldHint>
          <Button type="submit">Update status</Button>
        </form>
      </div>
    </div>
  );
}
