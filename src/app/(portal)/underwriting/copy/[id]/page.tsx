import { orderNumberLabel } from "@/lib/underwriting/contract-label";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailSummary } from "@/components/ui/detail-summary";
import { FieldHint, Label, Select } from "@/components/ui/input";
import { getCopyDetail } from "@/lib/underwriting/queries";
import { setCopyStatus } from "../../copy-actions";
import { isPortalAssignedCut } from "@/lib/underwriting/dad-cut";
import { CopyCutButton } from "./copy-cut-button";
import type { UwCopyApprovalStatus } from "@/lib/database.types";

const APPROVAL_VARIANT: Record<UwCopyApprovalStatus, BadgeVariant> = {
  draft: "neutral",
  approved: "success",
  expired: "muted",
  retired: "muted",
};

/**
 * A copy row's detail page: the script itself, the contracts it is linked
 * to, and — in the right column (docs/ui-patterns.md rule 5) — a read-only
 * summary with an Edit link plus the approval-status control, the one
 * action that stays here because it is a workflow gate, not an edit.
 */
export default async function CopyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const copy = await getCopyDetail(id);
  if (!copy) notFound();

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <Link href="/underwriting/copy" className="text-xs font-semibold text-brand-link">
          ← Back to copy library
        </Link>
        <div className="mt-2 mb-4 flex flex-wrap items-center gap-2.5">
          <h2 className="font-serif text-xl font-bold text-ink-900">{copy.label}</h2>
          <Badge variant={APPROVAL_VARIANT[copy.approval_status]}>{copy.approval_status}</Badge>
          <Badge variant="neutral">
            {copy.execution_kind === "recorded" ? "Recorded spot" : "Live read"}
          </Badge>
          {saved === "created" && <Badge variant="success">Created</Badge>}
          {saved === "1" && <Badge variant="success">Saved</Badge>}
        </div>

        {error && <Alert className="mb-4">{error}</Alert>}

        <div className="rounded border border-line">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
            Script
          </div>
          {copy.script ? (
            <p className="whitespace-pre-line px-5 py-4 text-sm leading-relaxed text-ink-900">
              {copy.script}
            </p>
          ) : (
            <p className="px-5 py-4 text-sm text-ink-500">No script recorded.</p>
          )}
        </div>

        <section aria-labelledby="in-dad" className="mt-6 rounded border border-line">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h3 id="in-dad" className="text-sm font-bold text-ink-900">
              In DAD
            </h3>
            <Link
              href={`/underwriting/copy/${copy.id}/edit`}
              className="text-[13px] font-bold text-brand-link hover:underline"
            >
              {copy.dad_cut ? "Change cut" : "Pick a DAD spot"}
            </Link>
          </div>
          {copy.dad_cut ? (
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-ink-500">DAD cut</span>
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-[28px] font-bold leading-none text-ink-900">
                    {copy.dad_cut}
                  </span>
                  <CopyCutButton cut={copy.dad_cut} />
                </div>
                <span className="text-xs text-ink-500">
                  {isPortalAssignedCut(copy.dad_cut) ? "New recording" : "Existing DAD spot"}
                </span>
              </div>
              <p className="flex-1 rounded bg-panel-50 px-4 py-3.5 text-sm leading-relaxed text-ink-700">
                {copy.execution_kind === "live_read"
                  ? "Hosts read this message live. For hours with no one on air, DAD plays its recorded version"
                  : "DAD plays this recording every time the credit airs"}
                {isPortalAssignedCut(copy.dad_cut) ? (
                  <>
                    {" "}
                    — record it into DAD under cut{" "}
                    <strong className="font-mono font-bold">{copy.dad_cut}</strong>.
                  </>
                ) : (
                  <>
                    , already in DAD as cut{" "}
                    <strong className="font-mono font-bold">{copy.dad_cut}</strong>.
                  </>
                )}
              </p>
            </div>
          ) : (
            <div className="p-5">
              <Alert variant="warning">
                This copy plays a spot that&apos;s already in DAD, and nobody has picked which one.
                Until someone does, it can&apos;t air in hours with no host.
              </Alert>
            </div>
          )}
        </section>

        <div className="mt-6 rounded border border-line">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
            Linked contracts
          </div>
          {copy.contracts.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-500">
              Not linked to any contract yet — link it from the contract&apos;s own page.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {copy.contracts.map((contract) => (
                <li key={contract.id} className="px-5 py-3 text-sm">
                  <Link
                    href={`/underwriting/contracts/${contract.id}`}
                    className="font-semibold text-brand-link"
                  >
                    {orderNumberLabel(contract.contract_identifier)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <aside aria-label="Copy details" className="flex w-full shrink-0 flex-col gap-6 lg:w-80">
        <DetailSummary
          title="Details"
          editHref={`/underwriting/copy/${copy.id}/edit`}
          items={[
            {
              label: "Execution",
              value:
                copy.execution_kind === "recorded"
                  ? "Recorded spot"
                  : "Live read — recorded version in automated hours",
            },
            {
              label: "Duration",
              value: copy.duration_seconds ? `${copy.duration_seconds}s` : null,
            },
            { label: "DAD cut", value: copy.dad_cut },
            {
              label: "Effective",
              value: `${copy.effective_from}${copy.effective_to ? ` – ${copy.effective_to}` : " onward"}`,
            },
          ]}
        />
        <div className="rounded border border-line">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
            Status
          </div>
          <form action={setCopyStatus} className="flex flex-col gap-4 p-5">
            <input type="hidden" name="copy_id" value={copy.id} />
            <div>
              <Label htmlFor="approval_status">Approval status</Label>
              <Select
                id="approval_status"
                name="approval_status"
                defaultValue={copy.approval_status}
              >
                <option value="draft">Draft</option>
                <option value="approved">Approved</option>
                <option value="expired">Expired</option>
                <option value="retired">Retired</option>
              </Select>
            </div>
            <FieldHint>
              Expired or unapproved copy can&apos;t be scheduled without an explicit override, once
              placement exists.
            </FieldHint>
            <Button type="submit">Update status</Button>
          </form>
        </div>
      </aside>
    </div>
  );
}
