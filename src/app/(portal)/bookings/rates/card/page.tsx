import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireBookingsAccess } from "@/lib/bookings/access";
import {
  getVersionDetail,
  listRateCardLines,
  listVersions,
  pickVersion,
} from "@/lib/bookings/queries";
import { formatDollars, formatShare } from "@/lib/bookings/rates";
import { cardForVersion, snapshotMatchesCard } from "@/lib/bookings/version-card";
import { snapshotRateCard } from "../actions";
import { NoVersions, RatesHeader } from "../rates-header";
import { PrintButton } from "./print-button";

type Params = { version?: string; error?: string };

export default async function RateCardPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const context = await requireBookingsAccess();
  const versions = await listVersions();
  const version = pickVersion(versions, params.version);
  if (!version) return <NoVersions context={context} section="card" />;
  const [detail, snapshot] = await Promise.all([
    getVersionDetail(version),
    listRateCardLines(version.id),
  ]);
  const computed = cardForVersion(detail);
  const provisional = version.status !== "adopted";
  const packagesById = new Map(detail.packages.map((pkg) => [pkg.id, pkg]));
  const snapshotStale =
    computed.ok && (snapshot.length === 0 || !snapshotMatchesCard(snapshot, computed.card));
  const margin = detail.assumptions.find((row) => row.key === "external_margin_share");
  const assessment = detail.assumptions.find((row) => row.key === "assessment_share");

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <RatesHeader
          context={context}
          versions={versions}
          version={version}
          section="card"
          error={params.error}
        />
      </div>

      {!computed.ok ? (
        <Alert variant="note">
          This version can&apos;t be priced yet. Missing: {computed.missing.join(", ")}.
        </Alert>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <div className="text-sm text-ink-700">
              {version.in_use ? (
                snapshotStale ? (
                  <span>
                    {snapshot.length === 0
                      ? "This card has not been recorded for estimates yet."
                      : "The assumptions have moved since this card was recorded for estimates."}
                  </span>
                ) : (
                  <span>
                    Recorded for estimates
                    {snapshot[0]?.snapshotted_at
                      ? ` on ${new Date(snapshot[0].snapshotted_at).toLocaleDateString("en-US", { dateStyle: "medium" })}`
                      : ""}
                    .
                  </span>
                )
              ) : (
                <span>
                  Computed from this version&apos;s assumptions; it is not the version in use.
                </span>
              )}
            </div>
            <span className="flex-1" />
            {context.isFinance && version.in_use && snapshotStale && (
              <form action={snapshotRateCard}>
                <input type="hidden" name="version_id" value={version.id} />
                <Button type="submit" variant="secondary">
                  Record for estimates
                </Button>
              </form>
            )}
            <PrintButton />
          </div>

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-3">
              <h3 className="font-serif text-[17px] font-bold text-ink-900">
                WUWF production rate card — {version.label}
              </h3>
              <Badge variant={provisional ? "warning" : "success"}>
                {provisional ? "Provisional" : "Adopted"}
              </Badge>
            </div>
            <p className="text-xs text-ink-500">
              {provisional
                ? "For planning only. Internal rates are cost-recovery estimates; external rates are cost-based floors pending market validation. UWF Budget / Controller validation and the Executive Director's approval are required before adoption."
                : "Internal rates recover cost; external rates are the higher of the defensible cost floor and the market floor."}
            </p>
            <TableFrame>
              <Table stack>
                <thead>
                  <HeaderRow>
                    <Th>Service</Th>
                    <Th>Unit</Th>
                    <Th className="text-right">Strategic internal</Th>
                    <Th className="text-right">Incremental internal</Th>
                    <Th className="text-right">External</Th>
                    <Th>Historical reference</Th>
                    <Th>Applies</Th>
                  </HeaderRow>
                </thead>
                <tbody>
                  {computed.card.packages.map((line) => {
                    const pkg = packagesById.get(line.key);
                    return (
                      <Row key={line.key}>
                        <Cell stack="title" className="font-semibold text-ink-900">
                          {line.name}
                        </Cell>
                        <Cell label="Unit">{line.unitLabel}</Cell>
                        <Cell
                          label="Strategic internal"
                          className="text-right font-semibold tabular-nums"
                        >
                          {formatDollars(line.strategicRate)}
                        </Cell>
                        <Cell
                          label="Incremental internal"
                          className="text-right font-semibold tabular-nums"
                        >
                          {formatDollars(line.incrementalRate)}
                        </Cell>
                        <Cell label="External" className="text-right font-semibold tabular-nums">
                          {formatDollars(line.externalRate)}
                        </Cell>
                        <Cell label="Historical reference" className="text-xs text-ink-500">
                          {pkg?.historical_reference ?? "—"}
                        </Cell>
                        <Cell label="Applies" className="text-xs text-ink-500">
                          {pkg?.application_note ?? "—"}
                        </Cell>
                      </Row>
                    );
                  })}
                </tbody>
              </Table>
            </TableFrame>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-bold text-ink-900">Additional and pass-through</h3>
            <TableFrame>
              <Table stack>
                <thead>
                  <HeaderRow>
                    <Th>Item</Th>
                    <Th className="text-right">Internal</Th>
                    <Th className="text-right">External</Th>
                    <Th>Unit</Th>
                    <Th>Treatment</Th>
                  </HeaderRow>
                </thead>
                <tbody>
                  {computed.card.labor.map((line) => (
                    <Row key={line.key}>
                      <Cell stack="title" className="font-semibold text-ink-900">
                        {line.name}
                      </Cell>
                      <Cell label="Internal" className="text-right tabular-nums">
                        {formatDollars(line.internalRate, { cents: true })}
                      </Cell>
                      <Cell label="External" className="text-right tabular-nums">
                        {formatDollars(line.externalRate)}
                      </Cell>
                      <Cell label="Unit">{line.unitLabel}</Cell>
                      <Cell label="Treatment" className="text-xs text-ink-500">
                        {line.treatment}
                      </Cell>
                    </Row>
                  ))}
                  <Row>
                    <Cell stack="title" className="font-semibold text-ink-900">
                      Direct project expenses
                    </Cell>
                    <Cell label="Internal" className="text-right">
                      at cost
                    </Cell>
                    <Cell label="External" className="text-right">
                      at cost + assessment
                    </Cell>
                    <Cell label="Unit">actual</Cell>
                    <Cell label="Treatment" className="text-xs text-ink-500">
                      Pass through: travel, rentals, licenses, shipping, specialty costs.
                      Partner-specific capital is funded separately, never buried in an hourly rate.
                    </Cell>
                  </Row>
                  <Row>
                    <Cell stack="title" className="font-semibold text-ink-900">
                      Institutional airtime beyond the contributed envelope
                    </Cell>
                    <Cell label="Internal" className="text-right text-ink-400">
                      [rate by pool]
                    </Cell>
                    <Cell label="External" className="text-right text-ink-400">
                      Traffic&apos;s card
                    </Cell>
                    <Cell label="Unit">airing</Cell>
                    <Cell label="Treatment" className="text-xs text-ink-500">
                      Set by the Executive Director per inventory pool; billed through a Traffic
                      contract, not here.
                    </Cell>
                  </Row>
                </tbody>
              </Table>
            </TableFrame>
          </section>

          <section className="rounded border border-line bg-panel-50 px-4 py-3 text-sm text-ink-700">
            <span className="font-bold text-ink-900">Rate application rule.</span> Strategic
            internal applies only to qualifying university work charged against the protected
            baseline envelope. Once it is exhausted, or where a project is ordinary partner-directed
            service, incremental internal applies. External work is accepted only when it consumes
            neither protected WUWF capacity nor the unused baseline reserve. Payment does not
            override mission or capacity limits.
            <span className="mt-2 block text-xs text-ink-500">
              External = the higher of incremental cost ÷ (1 −{" "}
              {margin ? formatShare(Number(margin.value)) : "margin"} −{" "}
              {assessment ? formatShare(Number(assessment.value)) : "assessment"}), rounded up to
              the next $25, and the package&apos;s market floor. A current market-rate survey is
              still required.
            </span>
          </section>
        </>
      )}
    </div>
  );
}
