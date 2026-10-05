import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { POOL_COSTING_LABEL, formatQuantity } from "@/lib/bookings/labels";
import { RATES_PATH, ratesHref } from "@/lib/bookings/paths";
import { getVersionDetail, listVersions, pickVersion } from "@/lib/bookings/queries";
import { formatDollars, formatShare } from "@/lib/bookings/rates";
import { cardForVersion } from "@/lib/bookings/version-card";
import { savePoolFigures, setPoolValidation } from "../actions";
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
  const pools = detail.poolCatalog.filter(
    (pool) => pool.active || detail.pools.some((row) => row.pool_id === pool.id),
  );
  const totalShare = detail.pools.reduce((sum, row) => sum + Number(row.allocation_share ?? 0), 0);
  const ownLines = (poolId: string) =>
    detail.assumptions
      .filter((row) => row.kind === "pool_line" && row.pool_id === poolId)
      .reduce((sum, row) => sum + Number(row.value), 0);

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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-ink-900">Resource pools</h3>
            <p className="text-xs text-ink-500">
              {sharedPool !== null
                ? `Shared pool ${formatDollars(sharedPool)} per year, split provisionally; replace with the asset inventory. `
                : "The shared pool's budget lines live on the Assumptions tab. "}
              A pool costed as a share takes that share of the shared pool; one costed from its own
              lines takes their sum. Cost per unit is annual cost divided by available units.
              {Math.abs(totalShare - 1) > 0.0001 && (
                <span className="text-warning-fg">
                  {" "}
                  The allocations sum to {formatShare(totalShare)}, not 100%.
                </span>
              )}
            </p>
          </div>
          <Link
            href={`${RATES_PATH}/setup`}
            className="text-sm font-bold text-brand-link hover:underline"
          >
            Add or retire a pool under Setup
          </Link>
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
              {pools.map((pool) => {
                const row = detail.pools.find((candidate) => candidate.pool_id === pool.id) ?? null;
                const derived = computed.ok
                  ? computed.card.derived.pools.find((p) => p.id === pool.id)
                  : undefined;
                if (canEdit && params.edit === pool.id) {
                  return (
                    <Row key={pool.id}>
                      <Cell colSpan={7} stack="full">
                        <form action={savePoolFigures} className="flex flex-col gap-3">
                          <input type="hidden" name="version_id" value={version.id} />
                          <input type="hidden" name="pool_id" value={pool.id} />
                          <div className="font-semibold text-ink-900">
                            {pool.name}{" "}
                            <span className="font-normal text-ink-500">
                              · {POOL_COSTING_LABEL[pool.costing]}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                            {pool.costing === "allocated" ? (
                              <div>
                                <Label htmlFor="allocation_percent">Allocation (%)</Label>
                                <Input
                                  id="allocation_percent"
                                  name="allocation_percent"
                                  inputMode="decimal"
                                  required
                                  autoFocus
                                  defaultValue={
                                    row ? String(Number(row.allocation_share ?? 0) * 100) : ""
                                  }
                                />
                              </div>
                            ) : (
                              <div className="text-sm text-ink-700">
                                <span className="block text-xs font-bold text-ink-700">
                                  Own budget lines
                                </span>
                                {formatDollars(ownLines(pool.id))} / yr on the Assumptions tab
                              </div>
                            )}
                            <div>
                              <Label htmlFor="available_units">
                                Available {pool.unit_label}s a year
                              </Label>
                              <Input
                                id="available_units"
                                name="available_units"
                                inputMode="decimal"
                                required
                                defaultValue={row ? String(row.available_units) : ""}
                                autoFocus={pool.costing !== "allocated"}
                              />
                            </div>
                            <div>
                              <Label htmlFor="basis">Basis</Label>
                              <Input id="basis" name="basis" defaultValue={row?.basis ?? ""} />
                            </div>
                            <div>
                              <Label htmlFor="validation_needed">What validating it takes</Label>
                              <Input
                                id="validation_needed"
                                name="validation_needed"
                                defaultValue={row?.validation_needed ?? ""}
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
                  <Row key={pool.id} className={pool.active ? undefined : "text-ink-400"}>
                    <Cell stack="title">
                      <div className="font-semibold text-ink-900">
                        {pool.name}
                        {!pool.active && (
                          <Badge variant="muted" className="ml-2">
                            Retired
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-ink-400">{POOL_COSTING_LABEL[pool.costing]}</div>
                      {row?.basis && <div className="mt-1 text-xs text-ink-500">{row.basis}</div>}
                    </Cell>
                    <Cell label="Allocation" className="text-right tabular-nums">
                      {pool.costing === "allocated"
                        ? row
                          ? formatShare(Number(row.allocation_share ?? 0))
                          : "—"
                        : "Own lines"}
                    </Cell>
                    <Cell label="Annual cost" className="text-right tabular-nums">
                      {derived
                        ? formatDollars(derived.annualCost, {
                            cents: !Number.isInteger(derived.annualCost),
                          })
                        : "—"}
                    </Cell>
                    <Cell label="Available units" className="text-right tabular-nums">
                      {row ? (
                        <>
                          {formatQuantity(Number(row.available_units))}{" "}
                          <span className="text-ink-400">{pool.unit_label}s</span>
                        </>
                      ) : (
                        <span className="text-ink-400">No figures on this version</span>
                      )}
                    </Cell>
                    <Cell label="Cost per unit" className="text-right tabular-nums">
                      <span className="font-semibold text-ink-900">
                        {derived ? formatDollars(derived.costPerUnit, { cents: true }) : "—"}
                      </span>
                      <span className="block text-xs text-ink-400">per {pool.unit_label}</span>
                    </Cell>
                    <Cell label="Validation">
                      {row ? (
                        <div className="flex flex-col gap-1.5">
                          <ValidationBadge state={row.validation_state} />
                          {row.validation_state === "pending" && row.validation_needed && (
                            <span className="text-xs text-ink-500">{row.validation_needed}</span>
                          )}
                          {canValidate && (
                            <ValidationControls
                              action={setPoolValidation}
                              id={row.id}
                              versionId={version.id}
                              state={row.validation_state}
                              note={row.validation_note}
                              acceptOpen={params.accept === row.id}
                              acceptHref={here({ accept: row.id })}
                              closeHref={here()}
                            />
                          )}
                          {!canValidate && row.validation_note && (
                            <span className="text-xs text-ink-500">{row.validation_note}</span>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </Cell>
                    <Cell stack="aside" className="text-right">
                      {canEdit && (
                        <Link
                          href={here({ edit: pool.id })}
                          className="text-sm font-bold text-brand-link hover:underline"
                        >
                          {row ? "Edit" : "Add figures"}
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
