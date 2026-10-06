import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { FilterChips } from "@/components/ui/filter-chips";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { PRODUCTION_RATE_LABEL } from "@/lib/bookings/labels";
import { BOOKINGS_PATH, withQuery } from "@/lib/bookings/paths";
import { assumedVersusObserved } from "@/lib/bookings/observed";
import {
  getActivePlan,
  listLaborClasses,
  listObservedInputs,
  listPools,
  listReportProjects,
} from "@/lib/bookings/queries";
import { formatDollars } from "@/lib/bookings/rates";
import { termReport, type ReportScope, type Totals } from "@/lib/bookings/report";
import type { BkPricingTreatment } from "@/lib/database.types";
import { formatDateShort } from "@/lib/log/program-status";

const REPORT_PATH = `${BOOKINGS_PATH}/report`;

const money = (value: number) => formatDollars(value, { cents: true });

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded border border-line bg-white px-4 py-3">
      <div className="text-xs font-semibold text-ink-500">{label}</div>
      <div className="mt-0.5 text-lg font-bold text-ink-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-500">{hint}</div>}
    </div>
  );
}

function TotalsCells({ totals }: { totals: Totals }) {
  return (
    <>
      <Cell label="Requests" className="text-right">
        {totals.count}
      </Cell>
      <Cell label="Full cost" className="text-right">
        {money(totals.fullCost)}
      </Cell>
      <Cell label="Partners pay" className="text-right">
        {money(totals.recovery)}
      </Cell>
      <Cell label="WUWF contributes" className="text-right font-semibold">
        {money(totals.contribution)}
      </Cell>
      <Cell label="Outside margin" className="text-right">
        {money(totals.margin)}
      </Cell>
      <Cell label="Assessment" className="text-right">
        {money(totals.assessment)}
      </Cell>
    </>
  );
}

function TotalsHead({ first }: { first: string }) {
  return (
    <thead>
      <HeaderRow>
        <Th>{first}</Th>
        <Th className="text-right">Requests</Th>
        <Th className="text-right">Full cost</Th>
        <Th className="text-right">Partners pay</Th>
        <Th className="text-right">WUWF contributes</Th>
        <Th className="text-right">Outside margin</Th>
        <Th className="text-right">Assessment</Th>
      </HeaderRow>
    </thead>
  );
}

/**
 * The term report (docs/bookings-design.md §19.3): what the work cost, what the
 * partners paid, and what WUWF contributed — by partner and by pricing
 * treatment — so the pilot can show what WUWF gives to university work and
 * test the legacy $500 webcast against modeled cost.
 */
export default async function TermReportPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const [{ scope: rawScope }] = await Promise.all([searchParams, requireBookingsAccess()]);
  const scope: ReportScope = rawScope === "booked" ? "booked" : "priced";
  const plan = await getActivePlan();
  if (!plan) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-serif text-[17px] font-bold text-ink-900">Term report</h2>
        <Alert variant="note">No term plan is active, so there is no term to report on.</Alert>
      </div>
    );
  }
  const [projects, observedInputs, classes, pools] = await Promise.all([
    listReportProjects(plan),
    listObservedInputs(plan),
    listLaborClasses(),
    listPools(),
  ]);
  const report = termReport(projects, scope);
  const observed = assumedVersusObserved(observedInputs.projects, observedInputs.events);
  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? "Labor";
  const poolName = (id: string | null) =>
    id ? (pools.find((p) => p.id === id)?.name ?? "A resource") : "Not tied to a resource";
  const treatments: BkPricingTreatment[] = ["strategic", "incremental", "external"];

  return (
    <div className="flex flex-col gap-6">
      <Link href={BOOKINGS_PATH} className="inline-block text-xs font-semibold text-brand-link">
        ← Dashboard
      </Link>
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="font-serif text-[17px] font-bold text-ink-900">Term report</h2>
        <span className="text-xs text-ink-500">
          {plan.label}, {formatDateShort(plan.starts_on)} – {formatDateShort(plan.ends_on)}. Costs
          are modeled and exact; prices are the rates charged. Provisional until a rate model
          version is adopted.
        </span>
      </div>
      <FilterChips
        label="Include"
        chips={[
          {
            label: "Everything priced",
            href: withQuery(REPORT_PATH, {}),
            active: scope === "priced",
          },
          {
            label: "Booked and later",
            href: withQuery(REPORT_PATH, { scope: "booked" }),
            active: scope === "booked",
          },
        ]}
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Full cost of the work"
          value={money(report.totals.fullCost)}
          hint="Labor + equipment and space + direct expenses; no margin, assessment or overhead"
        />
        <Tile label="Partners pay" value={money(report.totals.recovery)} />
        <Tile
          label="WUWF contributes"
          value={money(report.totals.contribution)}
          hint="Full cost not covered by what partners pay, request by request"
        />
        <Tile
          label="Outside margin and assessment"
          value={`${money(report.totals.margin)} · ${money(report.totals.assessment)}`}
          hint="Shown apart; never a negative contribution"
        />
      </section>

      {report.totals.count === 0 && (
        <Alert variant="note">
          No priced requests in this term yet. A request is priced when it is entered with a
          service.
        </Alert>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-ink-400">By pricing</h3>
        <TableFrame>
          <Table stack>
            <TotalsHead first="Rate" />
            <tbody>
              {treatments.map((t) => (
                <Row key={t}>
                  <Cell stack="title">
                    {PRODUCTION_RATE_LABEL[t]}
                    <span className="block text-xs capitalize text-ink-500">{t}</span>
                  </Cell>
                  <TotalsCells totals={report.byTreatment[t]} />
                </Row>
              ))}
            </tbody>
          </Table>
        </TableFrame>
        <p className="text-xs text-ink-500">
          {report.qualifying.count} request{report.qualifying.count === 1 ? "" : "s"} qualif
          {report.qualifying.count === 1 ? "ies" : "y"} as strategic or applied-learning work
          {report.qualifying.pricedUniversityRateForWantOfReserve > 0
            ? `; ${report.qualifying.pricedUniversityRateForWantOfReserve} of them ${report.qualifying.pricedUniversityRateForWantOfReserve === 1 ? "was" : "were"} priced at the university rate because the time set aside for them was used up`
            : ""}
          . {report.closedCount} closed request{report.closedCount === 1 ? "" : "s"} are not
          counted.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-ink-400">By partner</h3>
        <TableFrame>
          <Table stack>
            <TotalsHead first="Partner" />
            <tbody>
              {report.byPartner.length === 0 ? (
                <Row>
                  <Cell stack="full" colSpan={7}>
                    Nothing yet.
                  </Cell>
                </Row>
              ) : (
                report.byPartner.map((partner) => (
                  <Row key={partner.partnerId}>
                    <Cell stack="title">{partner.name}</Cell>
                    <TotalsCells totals={partner} />
                  </Row>
                ))
              )}
            </tbody>
          </Table>
        </TableFrame>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-ink-400">
          The $500 webcast, against cost
        </h3>
        {report.webcast ? (
          <div className="rounded border border-line bg-white px-4 py-3 text-sm text-ink-700">
            Across {report.webcast.events} webcast event{report.webcast.events === 1 ? "" : "s"}: it
            costs WUWF <strong>{money(report.webcast.costPerEvent)}</strong> an event; partners are
            charged <strong>{money(report.webcast.priceChargedPerEvent)}</strong>; the convention it
            replaces was {money(report.webcast.legacyPrice)}. The convention sits{" "}
            {money(Math.abs(report.webcast.costVersusLegacy))}{" "}
            {report.webcast.costVersusLegacy >= 0 ? "below" : "above"} the modeled cost.
          </div>
        ) : (
          <p className="text-sm text-ink-500">No webcast has been priced this term.</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-400">
            Assumed versus observed
          </h3>
          <p className="mt-1 max-w-3xl text-xs text-ink-500">
            Read-only, and it feeds nothing: what the packages assumed against what delivered
            projects confirmed they used, and the bookings WUWF refused or displaced. Utilization
            is never a pricing input — unit costs divide by practical capacity — so this informs
            the term report and a deliberate future capacity revision, and nothing else.{" "}
            {observed.confirmedProjects} project{observed.confirmedProjects === 1 ? "" : "s"} confirmed
            so far.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-bold text-ink-900">Package hours, assumed and confirmed</h4>
            <TableFrame>
              <Table stack>
                <thead>
                  <HeaderRow>
                    <Th>Labor</Th>
                    <Th className="text-right">Assumed</Th>
                    <Th className="text-right">Confirmed</Th>
                    <Th className="text-right">Projects</Th>
                  </HeaderRow>
                </thead>
                <tbody>
                  {observed.labor.length === 0 ? (
                    <Row>
                      <Cell stack="full" colSpan={4}>
                        Nothing confirmed yet.
                      </Cell>
                    </Row>
                  ) : (
                    observed.labor.map((row) => (
                      <Row key={row.classId}>
                        <Cell stack="title">{className(row.classId)}</Cell>
                        <Cell label="Assumed" className="text-right tabular-nums">
                          {row.assumed} h
                        </Cell>
                        <Cell label="Confirmed" className="text-right tabular-nums">
                          {row.confirmed} h
                        </Cell>
                        <Cell label="Projects" className="text-right">
                          {row.projects}
                        </Cell>
                      </Row>
                    ))
                  )}
                </tbody>
              </Table>
            </TableFrame>
            {observed.packages.length > 0 && (
              <p className="text-xs text-ink-500">
                By package, from projects that had only that package:{" "}
                {observed.packages
                  .map((p) => `${p.label} — ${p.assumed} h assumed, ${p.confirmed} h confirmed (${p.projects})`)
                  .join("; ")}
                .
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-bold text-ink-900">Resource units, planned and used</h4>
            <TableFrame>
              <Table stack>
                <thead>
                  <HeaderRow>
                    <Th>Resource</Th>
                    <Th className="text-right">Planned</Th>
                    <Th className="text-right">Used</Th>
                    <Th className="text-right">Projects</Th>
                  </HeaderRow>
                </thead>
                <tbody>
                  {observed.resources.length === 0 ? (
                    <Row>
                      <Cell stack="full" colSpan={4}>
                        Nothing confirmed yet.
                      </Cell>
                    </Row>
                  ) : (
                    observed.resources.map((row) => (
                      <Row key={row.poolId}>
                        <Cell stack="title">{poolName(row.poolId)}</Cell>
                        <Cell label="Planned" className="text-right tabular-nums">
                          {row.planned}
                        </Cell>
                        <Cell label="Used" className="text-right tabular-nums">
                          {row.used}
                        </Cell>
                        <Cell label="Projects" className="text-right">
                          {row.projects}
                        </Cell>
                      </Row>
                    ))
                  )}
                </tbody>
              </Table>
            </TableFrame>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-bold text-ink-900">Refused or displaced bookings, by resource</h4>
          <TableFrame>
            <Table stack>
              <thead>
                <HeaderRow>
                  <Th>Resource</Th>
                  <Th className="text-right">Refused</Th>
                  <Th className="text-right">Displaced (held or confirmed date released)</Th>
                </HeaderRow>
              </thead>
              <tbody>
                {observed.events.length === 0 ? (
                  <Row>
                    <Cell stack="full" colSpan={3}>
                      None this term.
                    </Cell>
                  </Row>
                ) : (
                  observed.events.map((row) => (
                    <Row key={row.poolId ?? "none"}>
                      <Cell stack="title">{poolName(row.poolId)}</Cell>
                      <Cell label="Refused" className="text-right tabular-nums">
                        {row.refused}
                      </Cell>
                      <Cell label="Displaced" className="text-right tabular-nums">
                        {row.released}
                      </Cell>
                    </Row>
                  ))
                )}
              </tbody>
            </Table>
          </TableFrame>
        </div>
      </section>
    </div>
  );
}
