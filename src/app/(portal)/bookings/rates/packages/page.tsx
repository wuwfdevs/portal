import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { formatQuantity } from "@/lib/bookings/labels";
import { ratesHref } from "@/lib/bookings/paths";
import {
  getVersionDetail,
  listVersions,
  pickVersion,
  type BkServicePackageRow,
} from "@/lib/bookings/queries";
import {
  POOL_KEYS,
  POOL_LABEL,
  formatDollars,
  formatShare,
  type PackageCosts,
} from "@/lib/bookings/rates";
import { cardForVersion } from "@/lib/bookings/version-card";
import { createPackage, setPackageActive, updatePackage } from "../actions";
import { NoVersions, RatesHeader } from "../rates-header";

type Params = { version?: string; edit?: string; new?: string; error?: string };

function PackageFields({ defaults }: { defaults?: BkServicePackageRow }) {
  const num = (value: number | undefined) => (value === undefined ? "" : String(value));
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <Label htmlFor="pkg-name">Service</Label>
          <Input id="pkg-name" name="name" defaultValue={defaults?.name ?? ""} required autoFocus />
        </div>
        <div>
          <Label htmlFor="pkg-unit">Unit</Label>
          <Input
            id="pkg-unit"
            name="unit_label"
            defaultValue={defaults?.unit_label ?? ""}
            placeholder="event, half-day, hour"
            required
          />
        </div>
        <div>
          <Label htmlFor="pkg-floor">External market floor ($)</Label>
          <Input
            id="pkg-floor"
            name="market_floor"
            inputMode="decimal"
            defaultValue={num(defaults?.market_floor)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-7">
        <div>
          <Label htmlFor="pkg-pro">Pro hrs</Label>
          <Input
            id="pkg-pro"
            name="professional_hours"
            inputMode="decimal"
            defaultValue={num(defaults?.professional_hours)}
          />
        </div>
        <div>
          <Label htmlFor="pkg-student">Student hrs</Label>
          <Input
            id="pkg-student"
            name="student_hours"
            inputMode="decimal"
            defaultValue={num(defaults?.student_hours)}
          />
        </div>
        <div>
          <Label htmlFor="pkg-studio">Studio</Label>
          <Input
            id="pkg-studio"
            name="studio_units"
            inputMode="decimal"
            defaultValue={num(defaults?.studio_units)}
          />
        </div>
        <div>
          <Label htmlFor="pkg-field">Field</Label>
          <Input
            id="pkg-field"
            name="field_units"
            inputMode="decimal"
            defaultValue={num(defaults?.field_units)}
          />
        </div>
        <div>
          <Label htmlFor="pkg-live">Live</Label>
          <Input
            id="pkg-live"
            name="live_units"
            inputMode="decimal"
            defaultValue={num(defaults?.live_units)}
          />
        </div>
        <div>
          <Label htmlFor="pkg-edit">Edit hrs</Label>
          <Input
            id="pkg-edit"
            name="edit_units"
            inputMode="decimal"
            defaultValue={num(defaults?.edit_hours)}
          />
        </div>
        <div>
          <Label htmlFor="pkg-ops">Webcast ops</Label>
          <Input
            id="pkg-ops"
            name="webcast_ops_units"
            inputMode="decimal"
            defaultValue={num(defaults?.webcast_ops_units)}
          />
        </div>
      </div>
      <FieldHint>
        Units of each pool in the pool&apos;s own unit (studio half-days, field and live days, edit
        hours). A project day is 8 professional hours, so the professional hours are the
        package&apos;s draw on the capacity reserve.
      </FieldHint>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="pkg-hist">Historical reference</Label>
          <Input
            id="pkg-hist"
            name="historical_reference"
            defaultValue={defaults?.historical_reference ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="pkg-app">Applies</Label>
          <Input
            id="pkg-app"
            name="application_note"
            defaultValue={defaults?.application_note ?? ""}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="pkg-notes">Notes</Label>
        <Textarea id="pkg-notes" name="notes" rows={2} defaultValue={defaults?.notes ?? ""} />
      </div>
    </>
  );
}

export default async function ServicePackagesPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const context = await requireBookingsAccess();
  const versions = await listVersions();
  const version = pickVersion(versions, params.version);
  if (!version) return <NoVersions context={context} section="packages" />;
  const detail = await getVersionDetail(version);
  const computed = cardForVersion(detail);
  const costs = new Map<string, PackageCosts>(
    computed.ok ? computed.card.packages.map((line) => [line.key, line]) : [],
  );
  const canEdit = context.isFinance && version.status === "draft";
  const here = (extra?: Record<string, string>) => ratesHref("packages", version.id, extra);
  const margin = detail.assumptions.find((row) => row.key === "external_margin_share");
  const assessment = detail.assumptions.find((row) => row.key === "assessment_share");

  return (
    <div className="flex flex-col gap-6">
      <RatesHeader
        context={context}
        versions={versions}
        version={version}
        section="packages"
        error={params.error}
      />

      {canEdit && params.new === "1" && (
        <InlineCreateCard
          title="Add a package"
          action={createPackage}
          submitLabel="Add package"
          cancelHref={here()}
        >
          <input type="hidden" name="version_id" value={version.id} />
          <div className="flex flex-col gap-4">
            <PackageFields />
          </div>
        </InlineCreateCard>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-ink-900">
              Service packages — what each one assumes
            </h3>
            <p className="text-xs text-ink-500">
              Strategic cost = student labor + resource units + webcast ops. Incremental cost adds
              professional hours at the loaded rate. External = the higher of incremental ÷ (1 −{" "}
              {margin ? formatShare(Number(margin.value)) : "margin"} −{" "}
              {assessment ? formatShare(Number(assessment.value)) : "assessment"}) and the market
              floor. Everything rounds up to the next $25 on the card.
            </p>
          </div>
          {canEdit && params.new !== "1" && (
            <Link
              href={here({ new: "1" })}
              className="text-sm font-bold text-brand-link hover:underline"
            >
              + Add a package
            </Link>
          )}
        </div>
        <TableFrame>
          <Table stack>
            <thead>
              <HeaderRow>
                <Th>Service</Th>
                <Th className="text-right">Pro hrs</Th>
                <Th className="text-right">Student hrs</Th>
                {POOL_KEYS.map((pool) => (
                  <Th key={pool} className="text-right">
                    {pool === "edit" ? "Edit hrs" : POOL_LABEL[pool].split(" ")[0]}
                  </Th>
                ))}
                <Th className="text-right">Ops</Th>
                <Th className="text-right">Strategic cost</Th>
                <Th className="text-right">Incremental cost</Th>
                <Th className="text-right">Market floor</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </HeaderRow>
            </thead>
            <tbody>
              {detail.packages.map((pkg) => {
                if (canEdit && params.edit === pkg.id) {
                  return (
                    <Row key={pkg.id}>
                      <Cell colSpan={12} stack="full">
                        <form action={updatePackage} className="flex flex-col gap-4">
                          <input type="hidden" name="id" value={pkg.id} />
                          <input type="hidden" name="version_id" value={version.id} />
                          <PackageFields defaults={pkg} />
                          <div className="flex items-center gap-4">
                            <Button type="submit">Save</Button>
                            <Link
                              href={here()}
                              className="text-sm font-bold text-brand-link hover:underline"
                            >
                              Cancel
                            </Link>
                          </div>
                        </form>
                      </Cell>
                    </Row>
                  );
                }
                const cost = costs.get(pkg.id);
                const units = [pkg.studio_units, pkg.field_units, pkg.live_units, pkg.edit_hours];
                return (
                  <Row key={pkg.id} className={pkg.active ? undefined : "text-ink-400"}>
                    <Cell stack="title">
                      <div className="font-semibold text-ink-900">
                        {pkg.name}{" "}
                        <span className="font-normal text-ink-500">· {pkg.unit_label}</span>
                        {!pkg.active && (
                          <Badge variant="muted" className="ml-2">
                            Retired
                          </Badge>
                        )}
                      </div>
                      {pkg.notes && <div className="text-xs text-ink-400">{pkg.notes}</div>}
                    </Cell>
                    <Cell label="Pro hrs" className="text-right tabular-nums">
                      {formatQuantity(Number(pkg.professional_hours))}
                    </Cell>
                    <Cell label="Student hrs" className="text-right tabular-nums">
                      {formatQuantity(Number(pkg.student_hours))}
                    </Cell>
                    {POOL_KEYS.map((pool, index) => (
                      <Cell
                        key={pool}
                        label={pool === "edit" ? "Edit hrs" : POOL_LABEL[pool]}
                        className="text-right tabular-nums"
                      >
                        {formatQuantity(Number(units[index]))}
                      </Cell>
                    ))}
                    <Cell label="Webcast ops" className="text-right tabular-nums">
                      {formatQuantity(Number(pkg.webcast_ops_units))}
                    </Cell>
                    <Cell label="Strategic cost" className="text-right tabular-nums">
                      {cost && pkg.active
                        ? formatDollars(cost.strategicCost, { cents: true })
                        : "—"}
                    </Cell>
                    <Cell label="Incremental cost" className="text-right tabular-nums">
                      {cost && pkg.active
                        ? formatDollars(cost.incrementalCost, { cents: true })
                        : "—"}
                    </Cell>
                    <Cell label="Market floor" className="text-right tabular-nums">
                      {formatDollars(Number(pkg.market_floor))}
                    </Cell>
                    <Cell stack="full" className="text-right">
                      {canEdit && (
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            href={here({ edit: pkg.id })}
                            className="text-sm font-bold text-brand-link hover:underline"
                          >
                            Edit
                          </Link>
                          <form action={setPackageActive}>
                            <input type="hidden" name="id" value={pkg.id} />
                            <input type="hidden" name="version_id" value={version.id} />
                            <input
                              type="hidden"
                              name="active"
                              value={pkg.active ? "false" : "true"}
                            />
                            <Button type="submit" variant="ghost" className="text-xs text-ink-500">
                              {pkg.active ? "Retire" : "Restore"}
                            </Button>
                          </form>
                        </div>
                      )}
                    </Cell>
                  </Row>
                );
              })}
            </tbody>
          </Table>
        </TableFrame>
        <p className="text-xs text-ink-500">
          lib/bookings/rates.ts reproduces each of these from the assumptions; the v0.1 workbook is
          its test fixture. A retired package stays on the version for the estimates that used it
          and leaves the card.
        </p>
      </section>
    </div>
  );
}
