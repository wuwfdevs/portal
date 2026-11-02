import { orderNumberLabel } from "@/lib/underwriting/contract-label";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DetailSummary } from "@/components/ui/detail-summary";
import { getUnderwriterDetail, listIndustryCategories } from "@/lib/underwriting/queries";
import { TextLink } from "@/components/ui/primary-link";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { CONTRACT_STATUS } from "@/lib/underwriting/status";

/**
 * The underwriter's detail page: its contracts, with a read-only summary
 * in the right column (docs/ui-patterns.md rule 5 — a detail page keeps a
 * right column for context and actions; editing moved to /edit).
 */
export default async function UnderwriterDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const [underwriter, categories] = await Promise.all([
    getUnderwriterDetail(id),
    listIndustryCategories(),
  ]);
  if (!underwriter) notFound();
  const industry = underwriter.category_id
    ? (categories.find((category) => category.id === underwriter.category_id)?.name ?? null)
    : null;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <TextLink href="/underwriting/underwriters" className="text-xs">
          ← Back to underwriters
        </TextLink>
        <div className="mt-2 mb-4 flex flex-wrap items-center gap-3">
          <h2 className="font-serif text-xl font-bold text-ink-900">{underwriter.name}</h2>
          {saved === "created" && <Badge variant="success">Created</Badge>}
          {saved === "1" && <Badge variant="success">Saved</Badge>}
        </div>

        {error && <Alert className="mb-4">{error}</Alert>}

        <Card>
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <span className="text-sm font-bold text-ink-900">Contracts</span>
            <TextLink href={`/underwriting/contracts/new?underwriter=${underwriter.id}`}>
              + New contract
            </TextLink>
          </div>
          {underwriter.contracts.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-500">No contracts yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {underwriter.contracts.map((contract) => (
                <li
                  key={contract.id}
                  className="flex items-center justify-between gap-2 px-5 py-3 text-sm"
                >
                  <div>
                    <TextLink href={`/underwriting/contracts/${contract.id}`}>
                      {orderNumberLabel(contract.contract_identifier)}
                    </TextLink>
                    <div className="mt-0.5 text-xs text-ink-500">
                      {contract.effective_from}
                      {contract.effective_to ? ` – ${contract.effective_to}` : ""}
                    </div>
                  </div>
                  <StatusBadge map={CONTRACT_STATUS} value={contract.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <aside aria-label="Underwriter details" className="w-full shrink-0 lg:w-80">
        <DetailSummary
          title="Details"
          editHref={`/underwriting/underwriters/${underwriter.id}/edit`}
          items={[
            { label: "Industry", value: industry },
            { label: "Contact", value: underwriter.contact_name },
            { label: "Phone", value: underwriter.phone },
            { label: "Email", value: underwriter.email },
            { label: "Address", value: underwriter.mailing_address, preserveLines: true },
            { label: "Notes", value: underwriter.notes, preserveLines: true },
          ]}
        />
      </aside>
    </div>
  );
}
