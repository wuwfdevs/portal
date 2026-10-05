import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { formatQuantity } from "@/lib/bookings/labels";
import { ratesHref } from "@/lib/bookings/paths";
import { getVersionDetail, listVersions, pickVersion } from "@/lib/bookings/queries";
import { POOL_LABEL, formatDollars, formatShare } from "@/lib/bookings/rates";
import { cardForVersion } from "@/lib/bookings/version-card";
import { setPoolValidation, updatePool } from "../actions";
import { NoVersions, RatesHeader } from "../rates-header";
import { ValidationBadge, ValidationControls } from "../validation-controls";

type Params = { version?: string; edit?: string; accept?: string; error?: string };

export default async function ResourcePoolsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const context = await requireBookingsAccess();
  const versions = await listVersions();
  const version = pickVersion(versions, params.version);
  if (!version) return <NoVersions context={context} section="pools" />;
  const detail = await getVersionDetail(version);
  const computed = cardForVersion(detail);
  const canEdit = context.isFinance && version.status === "draft";
  const canValidate =
    context.isFinance && (version.status === "draft" || version.status === "submitted");
  const here = (extra?: Record<string, string>) => ratesHref("pools", version.id, extra);
  const sharedPool = computed.ok ? computed.card.derived.sharedPoolAnnual : null;
  const totalShare = detail.pools.reduce((sum, pool) => sum + Number(pool.allocation_share), 0);

  return (
    <div className="flex flex-col gap-6">
      <RatesHeader
        context={context}
        versions={versions}
        version={version}
        section="pools"
        error={params.error}
      />

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-bold text-ink-900">Resource pools</h3>
          <p className="text-xs text-ink-500">
            {sharedPool !== null
              ? `Shared pool ${formatDollars(sharedPool)} per year, split provisionally; replace with the asset inventory. `
              : "The shared pool's budget lines live on the Assumptions tab. "}
            Cost per unit is a pool&apos;s share of the pool divided by its available units.
            {Math.abs(totalShare - 1) > 0.0001 && (
              <span className="text-warning-fg">
                {" "}
                The allocations sum to {formatShare(totalShare)}, not 100%.
              </span>
            )}
          </p>
        </div>
        <TableFrame>
          <Table stack>
            <thead>
              <HeaderRow>
                <Th>Pool</Th>
                <Th className="text-right">Allocation</Th>
                <Th className="text-right">Annual cost</Th>
                <Th className="text-right">Available units</Th>
                <Th className="text-right">Cost per unit</Th>
                <Th>Validation</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </HeaderRow>
            </thead>
            <tbody>
              {detail.pools.map((pool) => {
                const derived = computed.ok ? computed.card.derived.pools[pool.pool] : null;
                if (canEdit && params.edit === pool.id) {
                  return (
                    <Row key={pool.id}>
                      <Cell colSpan={7} stack="full">
                        <form action={updatePool} className="flex flex-col gap-3">
                          <input type="hidden" name="id" value={pool.id} />
                          <input type="hidden" name="version_id" value={version.id} />
                          <div className="font-semibold text-ink-900">{POOL_LABEL[pool.pool]}</div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                            <div>
                              <Label htmlFor={`share-${pool.id}`}>Allocation (%)</Label>
                              <Input
                                id={`share-${pool.id}`}
                                name="allocation_percent"
                                inputMode="decimal"
                                defaultValue={String(Number(pool.allocation_share) * 100)}
                                required
                                autoFocus
                              />
                            </div>
                            <div>
                              <Label htmlFor={`units-${pool.id}`}>Available units a year</Label>
                              <Input
                                id={`units-${pool.id}`}
                                name="available_units"
                                inputMode="decimal"
                                defaultValue={String(pool.available_units)}
                                required
                              />
                            </div>
                            <div>
                              <Label htmlFor={`unit-${pool.id}`}>Unit</Label>
                              <Input
                                id={`unit-${pool.id}`}
                                name="unit_label"
                                defaultValue={pool.unit_label}
                                required
                              />
                              <FieldHint>
                                half-day, day or hour — the booking rule&apos;s window names.
                              </FieldHint>
                            </div>
                            <div>
                              <Label htmlFor={`basis-${pool.id}`}>Basis</Label>
                              <Input
                                id={`basis-${pool.id}`}
                                name="basis"
                                defaultValue={pool.basis ?? ""}
                              />
                            </div>
                          </div>
                          <div>
                            <Label htmlFor={`needed-${pool.id}`}>What validating it takes</Label>
                            <Input
                              id={`needed-${pool.id}`}
                              name="validation_needed"
                              defaultValue={pool.validation_needed ?? ""}
                            />
                          </div>
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
                return (
                  <Row key={pool.id}>
                    <Cell stack="title">
                      <div className="font-semibold text-ink-900">{POOL_LABEL[pool.pool]}</div>
                      {pool.basis && <div className="text-xs text-ink-400">{pool.basis}</div>}
                    </Cell>
                    <Cell label="Allocation" className="text-right tabular-nums">
                      {formatShare(Number(pool.allocation_share))}
                    </Cell>
                    <Cell label="Annual cost" className="text-right tabular-nums">
                      {derived
                        ? formatDollars(derived.annualCost, {
                            cents: !Number.isInteger(derived.annualCost),
                          })
                        : "—"}
                    </Cell>
                    <Cell label="Available units" className="text-right tabular-nums">
                      {formatQuantity(Number(pool.available_units))}{" "}
                      <span className="text-ink-400">{pool.unit_label}s</span>
                    </Cell>
                    <Cell label="Cost per unit" className="text-right tabular-nums">
                      <span className="font-semibold text-ink-900">
                        {derived ? formatDollars(derived.costPerUnit, { cents: true }) : "—"}
                      </span>
                      <span className="block text-xs text-ink-400">per {pool.unit_label}</span>
                    </Cell>
                    <Cell label="Validation">
                      <div className="flex flex-col gap-1.5">
                        <ValidationBadge state={pool.validation_state} />
                        {pool.validation_state === "pending" && pool.validation_needed && (
                          <span className="text-xs text-ink-500">{pool.validation_needed}</span>
                        )}
                        {canValidate && (
                          <ValidationControls
                            action={setPoolValidation}
                            id={pool.id}
                            versionId={version.id}
                            state={pool.validation_state}
                            note={pool.validation_note}
                            acceptOpen={params.accept === pool.id}
                            acceptHref={here({ accept: pool.id })}
                            closeHref={here()}
                          />
                        )}
                        {!canValidate && pool.validation_note && (
                          <span className="text-xs text-ink-500">{pool.validation_note}</span>
                        )}
                      </div>
                    </Cell>
                    <Cell stack="full" className="text-right">
                      {canEdit && (
                        <Link
                          href={here({ edit: pool.id })}
                          className="text-sm font-bold text-brand-link hover:underline"
                        >
                          Edit
                        </Link>
                      )}
                    </Cell>
                  </Row>
                );
              })}
            </tbody>
          </Table>
        </TableFrame>
        <p className="text-xs text-ink-500">
          The pool recovers approved specialized production resources and direct operating cost,
          never commercial rent on UWF rooms. Studio, field, live and edit units stay separate
          availability constraints on the calendar.
        </p>
      </section>
    </div>
  );
}
