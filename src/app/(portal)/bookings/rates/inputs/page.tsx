import { Card } from "@/components/ui/card";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { buildInputsRows, progressLabel } from "@/lib/bookings/inputs-progress";
import { getVersionDetail, listVersions, pickVersion } from "@/lib/bookings/queries";
import { NoVersions, RatesHeader } from "../rates-header";

/**
 * Inputs: the checklist that replaces four tabs. One row per editor that
 * feeds the rate card, each with how much of it is validated; a row opens the
 * existing editor, which links back here. Nothing on this page edits
 * anything (docs/bookings-design.md §23).
 */
export default async function InputsPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string; error?: string }>;
}) {
  const params = await searchParams;
  const context = await requireBookingsAccess();
  const versions = await listVersions();
  const version = pickVersion(versions, params.version);
  if (!version) return <NoVersions context={context} section="inputs" />;
  const detail = await getVersionDetail(version);
  const rows = buildInputsRows(version.id, {
    assumptions: detail.assumptions.map((row) => ({ validationState: row.validation_state })),
    labor: detail.laborRates.map((row) => ({ validationState: row.validation_state })),
    pools: detail.pools.map((row) => ({ validationState: row.validation_state })),
    packages: detail.packages.length,
  });
  const pending = rows.reduce((sum, row) => sum + (row.pending ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <RatesHeader
        context={context}
        versions={versions}
        version={version}
        section="inputs"
        error={params.error}
        gatePending={pending}
      />
      <Card className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <h3 className="text-sm font-bold text-ink-900">Build the rate model</h3>
          <span className="text-xs text-ink-500">
            {pending === 0
              ? "Every input is validated."
              : `${pending} input${pending === 1 ? "" : "s"} still await validation.`}
          </span>
        </div>
        <ul>
          {rows.map((row) => (
            <li key={row.section} className="border-t border-line">
              <Link
                href={row.href}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-panel-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-ink-900">{row.label}</span>
                  <span className="block text-xs text-ink-500">{row.description}</span>
                </span>
                <Badge variant={row.pending ? "warning" : "neutral"}>{progressLabel(row)}</Badge>
                <span className="text-sm font-bold text-brand-link">Open</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
