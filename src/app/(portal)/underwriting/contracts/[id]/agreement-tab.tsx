import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select } from "@/components/ui/input";
import { stationTodayISO } from "@/lib/log/timezone";
import { shortDate } from "@/lib/underwriting/dates";
import type { ContractDetail, UwAffidavitRow } from "@/lib/underwriting/queries";
import type { UwRevisionStatus } from "@/lib/database.types";
import { updateContractPolicy } from "../../contract-actions";
import { ContractDocumentUpload } from "../../contract-document-upload";
import { revisionName } from "./revision-panels";

export const REVISION_STATUS_VARIANT: Record<UwRevisionStatus, BadgeVariant> = {
  draft: "warning",
  current: "success",
  superseded: "muted",
  cancelled: "muted",
};

/** How the contract's separation rule reads to a person. */
export function separationSummary(contract: ContractDetail): string {
  if (contract.separation_policy === "min_minutes")
    return `At least ${contract.separation_minutes} min apart`;
  if (contract.separation_policy === "none") return "None beyond the standard rules";
  return contract.separation_source_text
    ? `“${contract.separation_source_text}” — undecided`
    : "None stated";
}

const SECTIONS = [
  ["signed-agreement", "Signed agreement"],
  ["traffic-policy", "Traffic policy"],
  ["affidavits", "Affidavits"],
  ["revisions", "Revisions"],
] as const;

/**
 * The Agreement tab: the signed order and everything about it that isn't
 * the schedule — the traffic policy (read first, `&edit=policy` to change
 * it), the affidavits, and the revision history.
 */
export function AgreementTab({
  contract,
  base,
  editingPolicy,
  affidavits,
  newAffidavitHref,
  lineCountByRevision,
}: {
  contract: ContractDetail;
  base: string;
  editingPolicy: boolean;
  affidavits: UwAffidavitRow[];
  /** Null for a draft contract, which has nothing to attest to yet. */
  newAffidavitHref: string | null;
  lineCountByRevision: Map<string, number>;
}) {
  const sectionHeader = "border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900";
  const policyRows: [string, string][] = [
    [
      "Total spots on the order",
      contract.stated_total_spots != null ? String(contract.stated_total_spots) : "Not stated",
    ],
    ["Separation", separationSummary(contract)],
    ["Preemption / makegood policy", contract.preemption_policy ?? "—"],
    ["Makegoods need agency approval", contract.makegood_requires_agency_approval ? "Yes" : "No"],
    ["Affidavits required", contract.affidavit_required ? "Yes" : "No"],
  ];

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Agreement sections" className="flex flex-wrap gap-x-1.5 text-[13px]">
        {SECTIONS.map(([id, label], index) => (
          <span key={id} className="flex items-center gap-1.5">
            {index > 0 && (
              <span aria-hidden="true" className="text-ink-400">
                ·
              </span>
            )}
            <a href={`#${id}`} className="font-semibold text-brand-link hover:underline">
              {label}
            </a>
          </span>
        ))}
      </nav>

      <section id="signed-agreement" className="scroll-mt-4 rounded border border-line">
        <h3 className={sectionHeader}>Signed agreement</h3>
        <div className="p-5">
          <ContractDocumentUpload
            contractId={contract.id}
            existingPath={contract.agreement_document_path}
          />
        </div>
      </section>

      <section id="traffic-policy" className="scroll-mt-4 rounded border border-line">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="text-sm font-bold text-ink-900">Traffic policy</h3>
          {!editingPolicy && (
            <Link
              href={`${base}?tab=agreement&edit=policy#traffic-policy`}
              className="text-[13px] font-semibold text-brand-link"
            >
              Edit
            </Link>
          )}
        </div>
        {editingPolicy ? (
          <form action={updateContractPolicy} className="flex flex-col gap-4 p-5">
            <input type="hidden" name="contract_id" value={contract.id} />
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
                  defaultValue={contract.preemption_policy ?? ""}
                />
              </div>
            </div>
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="separation_source_text">Separation, as the order prints it</Label>
                <Input
                  id="separation_source_text"
                  name="separation_source_text"
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
                  <option value="unspecified">
                    Undecided (blocks auto-fill if the order states one)
                  </option>
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
            <div className="flex items-center gap-3">
              <Button type="submit" variant="secondary">
                Save policy
              </Button>
              <Link
                href={`${base}?tab=agreement#traffic-policy`}
                className="text-[13px] font-semibold text-brand-link"
              >
                Cancel
              </Link>
            </div>
          </form>
        ) : (
          <dl className="px-5 py-2 text-[13px]">
            {policyRows.map(([term, value]) => (
              <div
                key={term}
                className="flex flex-col gap-0.5 border-b border-line py-2 last:border-b-0 sm:flex-row sm:justify-between sm:gap-4"
              >
                <dt className="text-ink-500">{term}</dt>
                <dd className="font-semibold text-ink-900 sm:text-right">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section id="affidavits" className="scroll-mt-4 rounded border border-line">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="text-sm font-bold text-ink-900">Affidavits</h3>
          {newAffidavitHref && (
            <Link href={newAffidavitHref} className="text-[13px] font-semibold text-brand-link">
              Generate an affidavit
            </Link>
          )}
        </div>
        {affidavits.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-500">
            {newAffidavitHref === null
              ? "Affidavits can be generated once the contract is active."
              : contract.affidavit_required
                ? "The order requires affidavits, and none has been generated yet."
                : "None generated. The order doesn't require one, but you can still generate one."}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {affidavits.map((affidavit) => (
              <li
                key={affidavit.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
              >
                <Link
                  href={`/underwriting/affidavits/${affidavit.id}`}
                  className="font-semibold text-brand-link"
                >
                  {affidavit.campaign_period_start} – {affidavit.campaign_period_end}
                </Link>
                {affidavit.status === "certified" ? (
                  <Badge variant="success">
                    {affidavit.certified_at
                      ? `signed ${shortDate(stationTodayISO(affidavit.certified_at))}`
                      : "signed"}
                  </Badge>
                ) : (
                  <Badge variant="neutral">awaiting signature</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="revisions" className="scroll-mt-4 rounded border border-line">
        <h3 className={sectionHeader}>Revisions</h3>
        {contract.revisions.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-500">No revisions.</p>
        ) : (
          <ul className="divide-y divide-line">
            {contract.revisions.map((revision, index) => {
              const lines = lineCountByRevision.get(revision.id) ?? 0;
              return (
                <li
                  key={revision.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink-900">
                      {revisionName(revision, index)}
                    </span>
                    <Badge variant={REVISION_STATUS_VARIANT[revision.status]}>
                      {revision.status}
                    </Badge>
                    <span className="text-xs text-ink-400">
                      effective {revision.effective_from}
                      {revision.received_at ? ` · received ${revision.received_at}` : ""}
                      {` · ${lines} line${lines === 1 ? "" : "s"}`}
                    </span>
                  </span>
                  {revision.status === "draft" ? (
                    <Link
                      href={`${base}?activate=1`}
                      className="text-[13px] font-semibold text-brand-link"
                    >
                      Review and activate
                    </Link>
                  ) : (
                    revision.notes && <span className="text-xs text-ink-500">{revision.notes}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
