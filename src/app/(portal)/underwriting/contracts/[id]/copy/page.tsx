import Link from "next/link";
import { notFound } from "next/navigation";
import { getContractCopyContext, getContractDetail } from "@/lib/underwriting/queries";
import { ContractCopyPanel, type CopyPanelParams } from "../copy-panel";
import { WizardHeader } from "../wizard-header";

/**
 * Setup step 3: the messages this contract will air (docs/underwriting-
 * traffic-redesign.md §13). The panel is the same one the contract page's
 * Copy tab shows; this screen only puts it where a staffer setting up an
 * order reaches it in turn, between the schedule and the traffic policy.
 */
export default async function ContractCopyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<CopyPanelParams>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const contract = await getContractDetail(id);
  if (!contract) notFound();
  const context = await getContractCopyContext(contract);
  const base = `/underwriting/contracts/${contract.id}`;

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

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <ContractCopyPanel contract={contract} surface="step" params={query} />

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Link
              href={`${base}/schedule`}
              className="px-1 text-sm font-bold text-brand-link hover:underline"
            >
              ← Back to schedule
            </Link>
            <span className="flex-1" />
            <Link
              href={`${base}/policy`}
              className="inline-flex items-center justify-center rounded bg-brand-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-[#2278B8]"
            >
              Continue to traffic policy
            </Link>
          </div>
        </div>

        <aside aria-label="About this step" className="flex w-full shrink-0 flex-col gap-4 lg:w-80">
          <div className="rounded border border-line bg-panel-50 px-5 py-4">
            <div className="text-[13px] font-bold text-ink-900">What this contract airs</div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-700">
              A contract needs at least one approved message before anything places. Write it here,
              or reuse one from the underwriter&apos;s previous orders — one message can serve more
              than one contract, in rotation.
            </p>
          </div>
          <div className="rounded border border-line bg-panel-50 px-5 py-4">
            <div className="text-[13px] font-bold text-ink-900">Approval is a one-click gate</div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-700">
              A new message starts as a draft unless you mark it approved. You can activate the
              contract before every message is approved; nothing places until one is. Approve here,
              or later from the contract page.
            </p>
          </div>
          {context.onFile.total > 0 && (
            <div className="rounded border border-line bg-white px-5 py-4">
              <div className="text-[13px] font-bold text-ink-900">From previous orders</div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-700">
                {contract.underwriter.name} has {context.onFile.total} message
                {context.onFile.total === 1 ? "" : "s"} on file, {context.onFile.approved} approved
                {context.onFile.lastContractIdentifier
                  ? `, last aired under ${context.onFile.lastContractIdentifier}`
                  : ""}
                .
              </p>
              {context.linkablePrimary.length > 0 && (
                <Link
                  href={`${base}/copy?link=1`}
                  className="mt-2 inline-block text-[13px] font-bold text-brand-link hover:underline"
                >
                  Link one of them →
                </Link>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
