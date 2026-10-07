import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { PAY_BASIS_LABEL } from "@/lib/bookings/labels";
import { RATES_PATH, ratesHref } from "@/lib/bookings/paths";
import { getVersionDetail, listVersions, pickVersion } from "@/lib/bookings/queries";
import { formatDollars, formatShare } from "@/lib/bookings/rates";
import { cardForVersion } from "@/lib/bookings/version-card";
import { saveLaborRate, setLaborRateValidation } from "../actions";
import { NoVersions, RatesHeader } from "../rates-header";
import { ValidationBadge, ValidationControls } from "../validation-controls";

type Params = { version?: string; edit?: string; accept?: string; error?: string };

/**
 * Labor: one row per labor class with this version's pay figures and the
 * loaded hourly cost they produce. A class with no figures on this version
 * is listed with "Add figures" — the version can't be priced until every
 * active class has them. The classes themselves are kept under Classes and pools.
 */
export default async function LaborPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const context = await requireBookingsAccess();
  const versions = await listVersions();
  const version = pickVersion(versions, params.version);
  if (!version) return <NoVersions context={context} section="labor" />;
  const detail = await getVersionDetail(version);
  const computed = cardForVersion(detail);
  const canEdit = context.isFinance && version.status === "draft";
  const canValidate =
    context.isFinance && (version.status === "draft" || version.status === "submitted");
  const here = (extra?: Record<string, string>) => ratesHref("labor", version.id, extra);
  const classes = detail.classes.filter(
    (cls) => cls.active || detail.laborRates.some((rate) => rate.labor_class_id === cls.id),
  );

  return (
    <div className="flex flex-col gap-6">
      <RatesHeader
        context={context}
        versions={versions}
        version={version}
        section="labor"
        error={params.error}
      />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-ink-900">Labor classes and their pay figures</h3>
            <p className="text-xs text-ink-500">
              A salaried class&apos;s loaded hourly cost is salary × (1 + load) ÷ paid hours; an
              hourly class&apos;s is wage × (1 + load). A class charged in a strategic price
              (students) adds to the strategic cost; one that is not (professionals,
              baseline-funded) adds only to the incremental cost.
            </p>
          </div>
          <Link
            href={`${RATES_PATH}/setup`}
            className="text-sm font-bold text-brand-link hover:underline"
          >
            Manage classes
          </Link>
        </div>
        <TableFrame>
          <Table stack>
            <thead>
              <HeaderRow>
                <Th>Class</Th>
                <Th>Pay</Th>
                <Th className="text-right">Load</Th>
                <Th className="text-right">Loaded hourly</Th>
                <Th className="text-right">External rate</Th>
                <Th>Validation</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </HeaderRow>
            </thead>
            <tbody>
              {classes.map((cls) => {
                const rate = detail.laborRates.find((row) => row.labor_class_id === cls.id) ?? null;
                const derived = computed.ok
                  ? computed.card.derived.labor.find((l) => l.id === cls.id)
                  : undefined;
                if (canEdit && params.edit === cls.id) {
                  return (
                    <Row key={cls.id}>
                      <Cell colSpan={7} stack="full">
                        <form action={saveLaborRate} className="flex flex-col gap-3">
                          <input type="hidden" name="version_id" value={version.id} />
                          <input type="hidden" name="labor_class_id" value={cls.id} />
                          <div className="font-semibold text-ink-900">
                            {cls.name}{" "}
                            <span className="font-normal text-ink-500">
                              · {PAY_BASIS_LABEL[cls.pay_basis]}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                            {cls.pay_basis === "salaried" ? (
                              <>
                                <div>
                                  <Label htmlFor="annual_salary">Annual salary ($)</Label>
                                  <Input
                                    id="annual_salary"
                                    name="annual_salary"
                                    inputMode="decimal"
                                    required
                                    autoFocus
                                    defaultValue={rate?.annual_salary ?? ""}
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="paid_hours">Annual paid hours</Label>
                                  <Input
                                    id="paid_hours"
                                    name="paid_hours"
                                    inputMode="decimal"
                                    required
                                    defaultValue={rate?.paid_hours ?? "2080"}
                                  />
                                </div>
                              </>
                            ) : (
                              <div>
                                <Label htmlFor="hourly_wage">Hourly wage ($)</Label>
                                <Input
                                  id="hourly_wage"
                                  name="hourly_wage"
                                  inputMode="decimal"
                                  required
                                  autoFocus
                                  defaultValue={rate?.hourly_wage ?? ""}
                                />
                              </div>
                            )}
                            <div>
                              <Label htmlFor="load_percent">Fringe / payroll load (%)</Label>
                              <Input
                                id="load_percent"
                                name="load_percent"
                                inputMode="decimal"
                                required
                                defaultValue={rate ? String(Number(rate.load_share) * 100) : ""}
                              />
                            </div>
                            <div>
                              <Label htmlFor="external_rate">External planning rate ($/hr)</Label>
                              <Input
                                id="external_rate"
                                name="external_rate"
                                inputMode="decimal"
                                required
                                defaultValue={rate?.external_rate ?? ""}
                              />
                              <FieldHint>
                                The card&apos;s rate for this class&apos;s hours beyond a package.
                              </FieldHint>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <Label htmlFor="basis">Basis</Label>
                              <Input id="basis" name="basis" defaultValue={rate?.basis ?? ""} />
                            </div>
                            <div>
                              <Label htmlFor="validation_needed">What validating it takes</Label>
                              <Input
                                id="validation_needed"
                                name="validation_needed"
                                defaultValue={rate?.validation_needed ?? ""}
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <Button type="submit">Save</Button>
                            <Link
                              href={here()}
                              className="text-sm font-bold text-brand-link hover:underline"
                            >
                              Cancel
                            </Link>
                            <span className="flex-1" />
                            <FieldHint>
                              A changed figure goes back to awaiting validation.
                            </FieldHint>
                          </div>
                        </form>
                      </Cell>
                    </Row>
                  );
                }
                return (
                  <Row key={cls.id} className={cls.active ? undefined : "text-ink-400"}>
                    <Cell stack="title">
                      <div className="font-semibold text-ink-900">
                        {cls.name}
                        {!cls.active && (
                          <Badge variant="muted" className="ml-2">
                            Retired
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-ink-400">
                        {cls.charged_in_strategic
                          ? "Charged in a strategic price"
                          : "Baseline-funded; incremental only"}
                      </div>
                      {rate?.basis && <div className="mt-1 text-xs text-ink-500">{rate.basis}</div>}
                    </Cell>
                    <Cell label="Pay">
                      {rate ? (
                        cls.pay_basis === "salaried" ? (
                          <>
                            {formatDollars(Number(rate.annual_salary ?? 0))} / yr
                            <span className="block text-xs text-ink-400">
                              {Number(rate.paid_hours ?? 0)} paid hours
                            </span>
                          </>
                        ) : (
                          `${formatDollars(Number(rate.hourly_wage ?? 0), { cents: true })} / hr`
                        )
                      ) : (
                        <span className="text-ink-400">No figures on this version</span>
                      )}
                    </Cell>
                    <Cell label="Load" className="text-right tabular-nums">
                      {rate ? formatShare(Number(rate.load_share)) : "—"}
                    </Cell>
                    <Cell label="Loaded hourly" className="text-right tabular-nums">
                      <span className="font-semibold text-ink-900">
                        {derived ? formatDollars(derived.loadedHourly, { cents: true }) : "—"}
                      </span>
                    </Cell>
                    <Cell label="External rate" className="text-right tabular-nums">
                      {rate ? `${formatDollars(Number(rate.external_rate))} / hr` : "—"}
                    </Cell>
                    <Cell label="Validation">
                      {rate ? (
                        <div className="flex flex-col gap-1.5">
                          <ValidationBadge state={rate.validation_state} />
                          {rate.validation_state === "pending" && rate.validation_needed && (
                            <span className="text-xs text-ink-500">{rate.validation_needed}</span>
                          )}
                          {canValidate && (
                            <ValidationControls
                              action={setLaborRateValidation}
                              id={rate.id}
                              versionId={version.id}
                              state={rate.validation_state}
                              note={rate.validation_note}
                              acceptOpen={params.accept === rate.id}
                              acceptHref={here({ accept: rate.id })}
                              closeHref={here()}
                            />
                          )}
                          {!canValidate && rate.validation_note && (
                            <span className="text-xs text-ink-500">{rate.validation_note}</span>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </Cell>
                    <Cell stack="aside" className="text-right">
                      {canEdit && (
                        <Link
                          href={here({ edit: cls.id })}
                          className="text-sm font-bold text-brand-link hover:underline"
                        >
                          {rate ? "Edit" : "Add figures"}
                        </Link>
                      )}
                    </Cell>
                  </Row>
                );
              })}
            </tbody>
          </Table>
        </TableFrame>
      </section>
    </div>
  );
}
