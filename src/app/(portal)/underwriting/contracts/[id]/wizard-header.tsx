import { orderNumberLabel } from "@/lib/underwriting/contract-label";
import { Badge } from "@/components/ui/badge";
import { Steps } from "@/components/ui/steps";
import { TextLink } from "@/components/ui/primary-link";

/**
 * The header every step of contract setup shares (docs/underwriting-
 * traffic-redesign.md §11, five steps since §13 split copy from the
 * traffic policy): who and which order, a status badge, and the step
 * indicator. Step 1 (the order) lives at /contracts/new before the
 * contract exists, so it renders this with no contract.
 */
export function WizardHeader({
  contract,
  current,
}: {
  contract: {
    id: string;
    underwriterName: string;
    identifier: string | null;
    effectiveFrom: string;
    effectiveTo: string | null;
    status: string;
  } | null;
  current: number;
}) {
  const base = contract ? `/underwriting/contracts/${contract.id}` : null;
  const steps = [
    { label: "The order", href: base ? `${base}/order` : "/underwriting/contracts/new" },
    { label: "Schedule", href: base ? `${base}/schedule` : undefined },
    { label: "Copy", href: base ? `${base}/copy` : undefined },
    { label: "Traffic policy", href: base ? `${base}/policy` : undefined },
    { label: "Review & activate", href: base ?? undefined },
  ];
  return (
    <div className="mb-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <TextLink
          href={current === 0 ? "/underwriting/contracts" : (base ?? "/underwriting/contracts")}
          className="text-xs"
        >
          ← {current === 0 ? "Contracts" : "Contract"}
        </TextLink>
        {contract ? (
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="font-serif text-xl font-bold text-ink-900">
              {contract.underwriterName}
            </h2>
            <span className="text-[13px] text-ink-500">
              {orderNumberLabel(contract.identifier)} · {contract.effectiveFrom}
              {contract.effectiveTo ? ` – ${contract.effectiveTo}` : ""}
            </span>
            <Badge variant={contract.status === "active" ? "success" : "neutral"}>
              {contract.status}
            </Badge>
          </div>
        ) : (
          <h2 className="font-serif text-xl font-bold text-ink-900">New contract</h2>
        )}
      </div>
      <Steps steps={steps} current={current} />
    </div>
  );
}
