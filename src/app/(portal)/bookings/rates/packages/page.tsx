import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { formatQuantity } from "@/lib/bookings/labels";
import { ratesHref } from "@/lib/bookings/paths";
import {
  listAgreementOptions,
  getVersionDetail,
  listVersions,
  pickVersion,
  type BkLaborClassRow,
  type BkPoolRow,
  type PackageWithParts,
} from "@/lib/bookings/queries";
import {
  formatDollars,
  formatShare,
  rateCeilingFlags,
  type PackageCosts,
} from "@/lib/bookings/rates";
import { cardForVersion } from "@/lib/bookings/version-card";
import { createPackage, setPackageActive, setPackageReview, updatePackage } from "../actions";
import { NoVersions, RatesHeader } from "../rates-header";
import { ValidationBadge, ValidationControls } from "../validation-controls";

type Params = {
  version?: string;
  edit?: string;
  new?: string;
  accept?: string;
  error?: string;
};

function PackageFields({
  defaults,
  classes,
  pools,
  agreements,
}: {
  defaults?: PackageWithParts;
  classes: BkLaborClassRow[];
  pools: BkPoolRow[];
  /** Agreements a bespoke package may be scoped to (slice 5): active and draft ones, by partner. */
  agreements: AgreementOption[];
}) {
  const hoursFor = (classId: string) =>
    defaults?.labor.find((row) => row.labor_class_id === classId)?.hours;
  const unitsFor = (poolId: string) =>
    defaults?.resources.find((row) => row.pool_id === poolId)?.units;
  const num = (value: number | undefined) => (value === undefined ? "" : String(value));
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
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
        <div>
          <Label htmlFor="pkg-ceiling">Market ceiling ($, optional)</Label>
          <Input
            id="pkg-ceiling"
            name="market_ceiling"
            inputMode="decimal"
            defaultValue={defaults?.market_ceiling == null ? "" : String(defaults.market_ceiling)}
          />
          <FieldHint>A rate above it is flagged for review, never capped.</FieldHint>
        </div>
      </div>
      <fieldset>
        <legend className="text-xs font-bold text-ink-700">Labor hours per class</legend>
        <div className="mt-1.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {classes.map((cls) => (
            <div key={cls.id}>
              <Label htmlFor={`labor-${cls.id}`}>{cls.name}</Label>
              <Input
                id={`labor-${cls.id}`}
                name={`labor_${cls.id}`}
                inputMode="decimal"
                defaultValue={num(hoursFor(cls.id))}
              />
            </div>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-xs font-bold text-ink-700">Resource units per pool</legend>
        <div className="mt-1.5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {pools.map((pool) => (
            <div key={pool.id}>
              <Label htmlFor={`pool-${pool.id}`}>
                {pool.name} <span className="font-normal text-ink-400">({pool.unit_label}s)</span>
              </Label>
              <Input
                id={`pool-${pool.id}`}
                name={`pool_${pool.id}`}
                inputMode="decimal"
                defaultValue={num(unitsFor(pool.id))}
              />
            </div>
          ))}
        </div>
        <FieldHint>
          Units in each pool&apos;s own unit. A class not charged in a strategic price (the
          production lead) is the package&apos;s draw on the capacity reserve.
        </FieldHint>
      </fieldset>
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="pkg-agreement">Scoped to an agreement</Label>
          <Select
            id="pkg-agreement"
            name="agreement_id"
            defaultValue={defaults?.agreement_id ?? ""}
          >
            <option value="">No — on the ordinary rate card</option>
            {agreements.map((agreement) => (
              <option key={agreement.id} value={agreement.id}>
                {agreement.partner_name}: {agreement.label}
              </option>
            ))}
          </Select>
          <FieldHint>
            A bespoke package (an episode under a standing agreement) is offered only to requests
            under that agreement and stays off the public rate card.
          </FieldHint>
        </div>
      </div>
      <div>
        <Label htmlFor="pkg-notes">Notes</Label>
        <Textarea id="pkg-notes" name="notes" rows={2} defaultValue={defaults?.notes ?? ""} />
      </div>
    </>
  );
}

interface AgreementOption {
  id: string;
  label: string;
  partner_name: string;
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
  const [detail, agreements] = await Promise.all([
    getVersionDetail(version),
    listAgreementOptions(),
  ]);
  const computed = cardForVersion(detail);
  const costs = new Map<string, PackageCosts>(
    computed.ok ? computed.card.packages.map((line) => [line.key, line]) : [],
  );
  const canEdit = context.isFinance && version.status === "draft";
  const canValidate =
    context.isFinance && (version.status === "draft" || version.status === "submitted");
  const here = (extra?: Record<string, string>) => ratesHref("packages", version.id, extra);
  const margin = detail.assumptions.find((row) => row.key === "external_margin_share");
  const assessment = detail.assumptions.find((row) => row.key === "assessment_share");
  // Columns: every active class and pool, plus any a package on this version still references.
  const classes = detail.classes.filter(
    (cls) =>
      cls.active ||
      detail.packages.some((pkg) => pkg.labor.some((row) => row.labor_class_id === cls.id)),
  );
  const pools = detail.poolCatalog.filter(
    (pool) =>
      pool.active ||
      detail.packages.some((pkg) => pkg.resources.some((row) => row.pool_id === pool.id)),
  );
  const columnCount = 1 + classes.length + pools.length + 4 + 1;

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
            <PackageFields classes={classes} pools={pools} agreements={agreements} />
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
              Strategic cost = resource units + the hours of every class charged in a strategic
              price. Incremental cost adds the other classes&apos; hours at their loaded rate.
              External = the higher of incremental ÷ (1 −{" "}
              {margin ? formatShare(Number(margin.value)) : "margin"} −{" "}
              {assessment ? formatShare(Number(assessment.value)) : "assessment"}) and the market
              floor. Everything rounds up to the next $25 on the card. The review status of a
              package&apos;s hours and market floor is shown here like any assumption; it never
              holds up a submission.
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
                {classes.map((cls) => (
                  <Th key={cls.id} className="text-right">
                    {cls.name} hrs
                  </Th>
                ))}
                {pools.map((pool) => (
                  <Th key={pool.id} className="text-right">
                    {pool.name.split(" / ")[0]}
                  </Th>
                ))}
                <Th className="text-right">Strategic cost</Th>
                <Th className="text-right">Incremental cost</Th>
                <Th className="text-right">Market floor · ceiling</Th>
                <Th>Review</Th>
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
                      <Cell colSpan={columnCount} stack="full">
                        <form action={updatePackage} className="flex flex-col gap-4">
                          <input type="hidden" name="id" value={pkg.id} />
                          <input type="hidden" name="version_id" value={version.id} />
                          <PackageFields
                            defaults={pkg}
                            classes={classes}
                            pools={pools}
                            agreements={agreements}
                          />
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
                        {pkg.agreement_id && (
                          <Badge variant="accent" className="ml-2">
                            {agreements.find((a) => a.id === pkg.agreement_id)?.partner_name ??
                              "Agreement"}{" "}
                            only
                          </Badge>
                        )}
                      </div>
                      {pkg.notes && <div className="text-xs text-ink-400">{pkg.notes}</div>}
                    </Cell>
                    {classes.map((cls) => (
                      <Cell
                        key={cls.id}
                        label={`${cls.name} hrs`}
                        className="text-right tabular-nums"
                      >
                        {formatQuantity(
                          pkg.labor.find((row) => row.labor_class_id === cls.id)?.hours ?? 0,
                        )}
                      </Cell>
                    ))}
                    {pools.map((pool) => (
                      <Cell key={pool.id} label={pool.name} className="text-right tabular-nums">
                        {formatQuantity(
                          pkg.resources.find((row) => row.pool_id === pool.id)?.units ?? 0,
                        )}
                      </Cell>
                    ))}
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
                    <Cell label="Market floor · ceiling" className="text-right tabular-nums">
                      {formatDollars(Number(pkg.market_floor))}
                      <span className="text-ink-400">
                        {" · "}
                        {pkg.market_ceiling === null
                          ? "no ceiling"
                          : formatDollars(Number(pkg.market_ceiling))}
                      </span>
                      {cost && pkg.active
                        ? rateCeilingFlags(cost, pkg.market_ceiling).map((treatment) => (
                            <Badge
                              key={treatment}
                              variant="warning"
                              className="mt-1 block text-right"
                            >
                              {treatment} rate above the ceiling — review the scope or the model
                            </Badge>
                          ))
                        : null}
                    </Cell>
                    <Cell label="Review">
                      <div className="flex flex-col gap-2">
                        {(["hours", "floor"] as const).map((which) => {
                          const state =
                            which === "hours"
                              ? pkg.hours_validation_state
                              : pkg.floor_validation_state;
                          const note =
                            which === "hours"
                              ? pkg.hours_validation_note
                              : pkg.floor_validation_note;
                          const key = `${pkg.id}:${which}`;
                          return (
                            <div key={which} className="flex flex-col gap-1">
                              <span className="text-xs font-semibold text-ink-700">
                                {which === "hours" ? "Hours" : "Market floor"}
                              </span>
                              <ValidationBadge state={state} />
                              {canValidate ? (
                                <ValidationControls
                                  action={setPackageReview}
                                  id={pkg.id}
                                  versionId={version.id}
                                  state={state}
                                  note={note}
                                  acceptOpen={params.accept === key}
                                  acceptHref={here({ accept: key })}
                                  closeHref={here()}
                                  extraFields={{ which }}
                                />
                              ) : (
                                note && <span className="text-xs text-ink-500">{note}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
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
