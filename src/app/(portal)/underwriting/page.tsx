import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { listContracts, listCopy } from "@/lib/underwriting/queries";

/**
 * docs/underwriting-design.md §4 describes this screen as "the two queues
 * that actually need daily attention: obligations that can't currently be
 * placed, and broadcast events awaiting exception resolution" — neither
 * exists yet (Workflows C/D/E land in later slices, once the Log boundary
 * is built). Until then this is a plain summary of what Slice 1 actually
 * has: contracts and copy, so it isn't a dead placeholder.
 */
export default async function UnderwritingDashboardPage() {
  const [contracts, copy] = await Promise.all([listContracts(), listCopy()]);

  const activeContracts = contracts.filter((contract) => contract.status === "active").length;
  const draftContracts = contracts.filter((contract) => contract.status === "draft").length;
  const copyPendingApproval = copy.filter((item) => item.approval_status === "draft").length;
  const copyApproved = copy.filter((item) => item.approval_status === "approved").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded border border-line p-4">
          <div className="text-2xl font-bold text-ink-900">{activeContracts}</div>
          <div className="text-xs text-ink-400">Active contracts</div>
        </div>
        <div className="rounded border border-line p-4">
          <div className="text-2xl font-bold text-ink-900">{draftContracts}</div>
          <div className="text-xs text-ink-400">Draft contracts</div>
        </div>
        <div className="rounded border border-line p-4">
          <div className="text-2xl font-bold text-ink-900">{copyApproved}</div>
          <div className="text-xs text-ink-400">Approved copy</div>
        </div>
        <div className="rounded border border-line p-4">
          <div className="text-2xl font-bold text-ink-900">{copyPendingApproval}</div>
          <div className="text-xs text-ink-400">Copy awaiting approval</div>
        </div>
      </div>

      <div className="max-w-xl rounded border border-dashed border-line p-5 text-sm text-ink-500">
        <p>
          Pre-broadcast conflict review and the post-broadcast exception queue land once credit
          placement into Log&apos;s rundowns exists — see{" "}
          <span className="font-mono text-xs">docs/underwriting-design.md</span> §7. Until then,{" "}
          <Link href="/underwriting/contracts" className="font-semibold text-brand-link">
            Contracts
          </Link>{" "}
          and{" "}
          <Link href="/underwriting/copy" className="font-semibold text-brand-link">
            Copy
          </Link>{" "}
          are where the work actually happens.
        </p>
      </div>

      {contracts.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">
            Recently added contracts
          </h2>
          <ul className="flex flex-col gap-2">
            {contracts.slice(0, 5).map((contract) => (
              <li key={contract.id} className="flex items-center gap-2.5 text-sm">
                <Link href={`/underwriting/contracts/${contract.id}`} className="font-semibold text-brand-link">
                  {contract.underwriter_name}
                </Link>
                <span className="text-ink-400">{contract.contract_identifier}</span>
                <Badge variant={contract.status === "active" ? "success" : "neutral"}>{contract.status}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
