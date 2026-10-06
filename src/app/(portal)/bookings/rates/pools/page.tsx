import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { POOL_COSTING_LABEL, formatQuantity } from "@/lib/bookings/labels";
import { RATES_PATH, ratesHref } from "@/lib/bookings/paths";
import {
  assetAnnualCosts,
  assetsNeedingLife,
  overlapWarnings,
  snapshotIsStale,
  type AssetLike,
  type FundingLineLike,
} from "@/lib/bookings/capital";
import {
  getVersionDetail,
  listAssets,
  listFundedAssets,
  listVersions,
  pickVersion,
} from "@/lib/bookings/queries";
import { formatDollars, formatShare } from "@/lib/bookings/rates";
import { cardForVersion } from "@/lib/bookings/version-card";
import { refreshFromAssetRegister, savePoolFigures, setPoolValidation } from "../actions";
import { NoVersions, RatesHeader } from "../rates-header";
import { ValidationBadge, ValidationControls } from "../validation-controls";

type Params = {
  version?: string;
  edit?: string;
  accept?: string;
  error?: string;
  saved?: string;
};

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

  // What the asset register says now, against what this version has snapshotted (§20.3, §20.4).
  const poolLines = detail.assumptions.filter((row) => row.kind === "pool_line" && !row.overhead);
  const [assets, funded] = await Promise.all([
    listAssets(),
    listFundedAssets(poolLines.map((row) => row.id)),
  ]);
  const assetLikes: AssetLike[] = assets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    pool_id: asset.pool_id,
    active: asset.active,
    replacement_cost: asset.replacement_cost === null ? null : Number(asset.replacement_cost),
    useful_life_years: asset.useful_life_years === null ? null : Number(asset.useful_life_years),
    annual_maintenance: asset.annual_maintenance === null ? null : Number(asset.annual_maintenance),
  }));
  const fundingLines: FundingLineLike[] = poolLines.map((row) => ({
    id: row.id,
    label: row.label,
    value: Number(row.value),
    funds_pool_id: row.funds_pool_id,
    asset_ids: funded.get(row.id) ?? [],
  }));
  const livePools = assetAnnualCosts(assetLikes, fundingLines);
  const poolName = (id: string) => detail.poolCatalog.find((p) => p.id === id)?.name ?? "A pool";
  const warnings = overlapWarnings(livePools, fundingLines, poolName);
  const missingLife = assetsNeedingLife(assetLikes);
  const stale = detail.pools.some((row) => snapshotIsStale(row, livePools[row.pool_id]));
  const overheadTotal = computed.ok ? computed.card.derived.overheadAnnual : 0;

  return (
    <div className="flex flex-col gap-6">
      <RatesHeader
        context={context}
        versions={versions}
        version={version}
        section="pools"
        error={params.error}
      />

      {params.saved === "refreshed" && (
        <Alert variant="note">Refreshed from the asset register.</Alert>
      )}
      {warnings.map((warning) => (
        <Alert key={warning.poolId} variant="note">
          <strong>Review: possible double count.</strong> {warning.message}
        </Alert>
      ))}
      {missingLife.length > 0 && (
        <Alert variant="note">
          {missingLife.length} asset{missingLife.length === 1 ? " has" : "s have"} a replacement
          cost but no realistic useful life, so {missingLife.length === 1 ? "it adds" : "they add"}{" "}
          nothing to a pool&apos;s cost yet: {missingLife.map((a) => a.name).join(", ")}.
        </Alert>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-ink-900">Resource pools</h3>
            <p className="text-xs text-ink-500">
              {sharedPool !== null
                ? `Shared pool ${formatDollars(sharedPool)} per year, split provisionally; replace with the asset inventory. `
                : "The shared pool's budget lines live on the Assumptions tab. "}
              A pool costed as a share takes that share of the shared pool; one costed from its own
              lines takes their sum; each adds what the asset register sets aside a year to replace
              its assets (replacement cost over realistic useful life) and their maintenance, and
              general overhead is left out ({formatDollars(overheadTotal)} a year). Cost per unit is
              annual cost divided by <strong>practical capacity</strong> — the realistic units the
              resource can deliver in a year after normal downtime and constraints, never expected
              bookings.
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
                <Th className="text-right">Practical capacity</Th>
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
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
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
                                Practical capacity, {pool.unit_label}s a year
                              </Label>
                              <Input
                                id="available_units"
                                name="available_units"
                                inputMode="decimal"
                                required
                                defaultValue={row ? String(row.available_units) : ""}
                                autoFocus={pool.costing !== "allocated"}
                              />
                              <FieldHint>
                                What it can realistically deliver after downtime — not expected
                                bookings.
                              </FieldHint>
                            </div>
                            <div>
                              <Label htmlFor="units_basis">The number is</Label>
                              <Select
                                id="units_basis"
                                name="units_basis"
                                defaultValue={row?.units_basis ?? "practical_capacity"}
                              >
                                <option value="practical_capacity">A practical capacity</option>
                                <option value="volume_forecast">
                                  A volume forecast, still to replace
                                </option>
                              </Select>
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
                      {derived && (derived.capitalCost > 0 || derived.maintenanceCost > 0) && (
                        <span className="block text-xs text-ink-500">
                          {formatDollars(derived.baseCost)} budget lines
                          {derived.capitalCost > 0
                            ? ` + ${formatDollars(derived.capitalCost)} capital set-aside`
                            : ""}
                          {derived.maintenanceCost > 0
                            ? ` + ${formatDollars(derived.maintenanceCost)} maintenance`
                            : ""}
                        </span>
                      )}
                    </Cell>
                    <Cell label="Practical capacity" className="text-right tabular-nums">
                      {row ? (
                        <>
                          {formatQuantity(Number(row.available_units))}{" "}
                          <span className="text-ink-400">{pool.unit_label}s</span>
                          {row.units_basis === "volume_forecast" && (
                            <Badge variant="warning" className="mt-1 block text-right">
                              Volume forecast — replace with the practical capacity
                            </Badge>
                          )}
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

      <section className="flex flex-col gap-2 rounded border border-line bg-white p-4">
        <h3 className="text-sm font-bold text-ink-900">Capital set-aside and maintenance</h3>
        <p className="text-xs text-ink-500">
          Each pool adds what must be set aside a year to replace its assets over their realistic
          life — replacement cost divided by useful life, not an accounting depreciation schedule —
          plus their maintenance. Blank fields add zero. A budget line that already funds specific
          assets can say so on the Assumptions tab, and those assets are left out.
        </p>
        <ul className="flex flex-col gap-1 text-sm text-ink-700">
          {detail.pools.map((row) => {
            const basis = row.asset_basis ?? [];
            return (
              <li key={row.id}>
                <span className="font-semibold text-ink-900">{poolName(row.pool_id)}</span>:{" "}
                {formatDollars(Number(row.capital_annual))} capital set-aside,{" "}
                {formatDollars(Number(row.maintenance_annual))} maintenance
                {basis.length > 0 &&
                  ` — ${basis
                    .map((a) => `${a.name}${a.coveredBy ? ` (funded by ${a.coveredBy})` : ""}`)
                    .join(", ")}`}
              </li>
            );
          })}
        </ul>
        {stale && (
          <p className="text-xs text-warning-fg">
            The asset register has changed since this version was last refreshed from it.
          </p>
        )}
        {canEdit && (
          <form action={refreshFromAssetRegister} className="mt-1">
            <input type="hidden" name="version_id" value={version.id} />
            <Button type="submit" variant="secondary">
              Refresh from the asset register
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}
