import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PRODUCTION_RATE_HINT, PRODUCTION_RATE_LABEL } from "@/lib/bookings/labels";
import type { LineEconomics, MarketBenchmark } from "@/lib/bookings/economics";
import type { ProjectDetail } from "@/lib/bookings/queries";
import { formatDollars } from "@/lib/bookings/rates";
import { RATE_CARD_STEP } from "@/lib/bookings/rates";

function dollars(value: number | null): string {
  return value === null ? "—" : formatDollars(Number(value), { cents: true });
}

/**
 * The calculation behind the summary line (docs/bookings-design.md §19.2): the
 * cost build-up per line, full cost, what the partner pays, what WUWF
 * contributes, an outside partner's margin and assessment, the market
 * benchmark per package, and why this rate. Closed by default; the internal
 * vocabulary is allowed here.
 */
export function CalculationPanel({
  detail,
  provisional,
}: {
  detail: ProjectDetail;
  provisional: boolean;
}) {
  const { project } = detail;
  const economics = project.economics;
  const lines = (economics?.lines ?? []) as LineEconomics[];
  const benchmarks = project.market_benchmarks as MarketBenchmark[];
  const external = project.priced_as === "external";

  return (
    <div className="flex flex-col gap-3 text-sm text-ink-700">
      {project.priced_as && (
        <p>
          <strong className="text-ink-900">{PRODUCTION_RATE_LABEL[project.priced_as]}.</strong>{" "}
          {PRODUCTION_RATE_HINT[project.priced_as]} {project.pricing_reason}
        </p>
      )}
      {economics?.error && <Alert variant="note">{economics.error}</Alert>}

      {lines.length > 0 && project.full_economic_cost !== null && (
        <div className="overflow-x-auto rounded border border-line">
          <table className="w-full text-left text-xs">
            <thead className="bg-panel-50 text-ink-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Line</th>
                <th className="px-3 py-2 text-right font-semibold">Labor</th>
                <th className="px-3 py-2 text-right font-semibold">Equipment &amp; space</th>
                <th className="px-3 py-2 text-right font-semibold">Direct</th>
                <th className="px-3 py-2 text-right font-semibold">Partner pays</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.lineId} className="border-t border-line">
                  <td className="px-3 py-1.5 text-ink-900">{line.label}</td>
                  <td className="px-3 py-1.5 text-right">{dollars(line.laborCost)}</td>
                  <td className="px-3 py-1.5 text-right">{dollars(line.resourceCost)}</td>
                  <td className="px-3 py-1.5 text-right">{dollars(line.directCost)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold">{dollars(line.amount)}</td>
                </tr>
              ))}
              <tr className="border-t border-line bg-panel-50/60 font-semibold text-ink-900">
                <td className="px-3 py-1.5">Full cost to WUWF</td>
                <td className="px-3 py-1.5 text-right">{dollars(project.labor_cost)}</td>
                <td className="px-3 py-1.5 text-right">{dollars(project.resource_cost)}</td>
                <td className="px-3 py-1.5 text-right">{dollars(project.direct_expense_cost)}</td>
                <td className="px-3 py-1.5 text-right">{dollars(project.full_economic_cost)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {project.full_economic_cost !== null && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-xs">
          <dt className="text-ink-500">Full cost to WUWF</dt>
          <dd className="font-semibold text-ink-900">{dollars(project.full_economic_cost)}</dd>
          <dt className="text-ink-500">The partner pays</dt>
          <dd className="font-semibold text-ink-900">{dollars(project.partner_recovery)}</dd>
          <dt className="text-ink-500">WUWF contributes</dt>
          <dd className="font-semibold text-ink-900">{dollars(project.wuwf_contribution)}</dd>
          {external && (
            <>
              <dt className="text-ink-500">University assessment</dt>
              <dd>{dollars(project.external_assessment)}</dd>
              <dt className="text-ink-500">Margin</dt>
              <dd>{dollars(project.external_margin)}</dd>
            </>
          )}
        </dl>
      )}
      {project.full_economic_cost !== null && (
        <p className="text-xs text-ink-500">
          Cost is exact. Each rate is rounded up to the next ${RATE_CARD_STEP} — a pricing policy
          applied to the rate only
          {external
            ? "; the margin and the assessment are shown apart and are never a negative contribution"
            : ""}
          . Overhead is not part of a project&apos;s cost.
        </p>
      )}

      {benchmarks.length > 0 && (
        <div className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-ink-700">Against the market</span>
          {benchmarks.map((b) => (
            <span key={b.packageId} className="text-ink-600">
              {b.label}: charged {dollars(b.rate)}; market floor {dollars(b.floor)}
              {b.ceiling !== null ? `, ceiling ${dollars(b.ceiling)}` : ""}
              {b.reference ? ` — ${b.reference}` : ""}
              {b.ceiling !== null && b.rate > b.ceiling && (
                <Badge variant="warning" className="ml-2">
                  Above market
                </Badge>
              )}
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-ink-500">
        Priced from rate model {detail.version_label ?? "in use"}
        {provisional ? " — provisional until a version is adopted" : ""}.
      </p>
    </div>
  );
}
