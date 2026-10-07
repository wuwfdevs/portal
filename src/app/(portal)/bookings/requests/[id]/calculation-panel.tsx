import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PRODUCTION_RATE_HINT, PRODUCTION_RATE_LABEL } from "@/lib/bookings/labels";
import type { LineEconomics, MarketBenchmark } from "@/lib/bookings/economics";
import type { ProjectDetail } from "@/lib/bookings/queries";
import { formatDollars } from "@/lib/bookings/rates";
import { RATE_CARD_STEP } from "@/lib/bookings/rates";
import { DescriptionList } from "@/components/ui/description-list";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";

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
        <TableFrame>
          <Table className="text-xs">
            <thead>
              <HeaderRow>
                <Th className="px-3 py-2 text-left">Line</Th>
                <Th className="px-3 py-2 text-right">Labor</Th>
                <Th className="px-3 py-2 text-right">Equipment &amp; space</Th>
                <Th className="px-3 py-2 text-right">Direct</Th>
                <Th className="px-3 py-2 text-right">Partner pays</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {lines.map((line) => (
                <Row key={line.lineId}>
                  <Cell className="px-3 py-1.5 text-ink-900">{line.label}</Cell>
                  <Cell className="px-3 py-1.5 text-right">{dollars(line.laborCost)}</Cell>
                  <Cell className="px-3 py-1.5 text-right">{dollars(line.resourceCost)}</Cell>
                  <Cell className="px-3 py-1.5 text-right">{dollars(line.directCost)}</Cell>
                  <Cell className="px-3 py-1.5 text-right font-semibold">
                    {dollars(line.amount)}
                  </Cell>
                </Row>
              ))}
              <Row className="bg-panel-50/60 font-semibold text-ink-900">
                <Cell className="px-3 py-1.5">Full cost to WUWF</Cell>
                <Cell className="px-3 py-1.5 text-right">{dollars(project.labor_cost)}</Cell>
                <Cell className="px-3 py-1.5 text-right">{dollars(project.resource_cost)}</Cell>
                <Cell className="px-3 py-1.5 text-right">
                  {dollars(project.direct_expense_cost)}
                </Cell>
                <Cell className="px-3 py-1.5 text-right">
                  {dollars(project.full_economic_cost)}
                </Cell>
              </Row>
            </tbody>
          </Table>
        </TableFrame>
      )}

      {project.full_economic_cost !== null && (
        <DescriptionList
          className="text-xs"
          items={[
            {
              label: "Full cost to WUWF",
              value: <span className="font-semibold">{dollars(project.full_economic_cost)}</span>,
            },
            {
              label: "The partner pays",
              value: <span className="font-semibold">{dollars(project.partner_recovery)}</span>,
            },
            {
              label: "WUWF contributes",
              value: <span className="font-semibold">{dollars(project.wuwf_contribution)}</span>,
            },
            ...(external
              ? [
                  { label: "University assessment", value: dollars(project.external_assessment) },
                  { label: "Margin", value: dollars(project.external_margin) },
                ]
              : []),
          ]}
        />
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
