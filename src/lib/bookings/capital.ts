// Capital consumption and maintenance from the asset register, and the
// double-count check — pure, no Supabase, no React.
// docs/bookings-design.md §20.3 and §20.4.
//
// Capital consumption is economic: what must be set aside each year to replace
// an asset over its realistic life (replacement cost ÷ realistic useful life),
// not its accounting depreciation schedule. A pool's annual cost adds, for each
// active asset on it, that plus its annual maintenance; a blank field adds
// zero. A budget line may say which pool's replacement it already funds and,
// optionally, which specific assets: naming an asset is the explicit linkage
// that leaves its capital out of the set-aside; naming only the pool excludes
// nothing and raises a review warning. Nothing here is a submission gate.

import { exactAmount } from "./economics";
import { formatUsd as formatCurrency } from "@/lib/format";

export interface AssetLike {
  id: string;
  name: string;
  pool_id: string;
  active: boolean;
  replacement_cost: number | null;
  /** The realistic useful life in years. */
  useful_life_years: number | null;
  annual_maintenance: number | null;
}

/** A budget line (a `pool_line` assumption that isn't general overhead) that may already fund replacement. */
export interface FundingLineLike {
  id: string;
  label: string;
  value: number;
  funds_pool_id: string | null;
  /** The specific assets it names, if any. */
  asset_ids: readonly string[];
}

export interface AssetCost {
  assetId: string;
  name: string;
  poolId: string;
  capital: number;
  maintenance: number;
  /** The label of the budget line that explicitly funds this asset's replacement, if any. */
  coveredBy: string | null;
  /** A replacement cost with no useful life adds nothing and needs one. */
  needsLife: boolean;
}

export interface PoolCapital {
  poolId: string;
  capital: number;
  maintenance: number;
  assets: AssetCost[];
}

export function assetAnnualCost(
  asset: AssetLike,
  lines: readonly FundingLineLike[] = [],
): AssetCost {
  const cost = Number(asset.replacement_cost ?? 0);
  const life = Number(asset.useful_life_years ?? 0);
  const needsLife = cost > 0 && life <= 0;
  const covering = lines.find((line) => line.asset_ids.includes(asset.id)) ?? null;
  const consumed = cost > 0 && life > 0 ? cost / life : 0;
  return {
    assetId: asset.id,
    name: asset.name,
    poolId: asset.pool_id,
    capital: covering ? 0 : exactAmount(consumed),
    maintenance: exactAmount(Number(asset.annual_maintenance ?? 0)),
    coveredBy: covering?.label ?? null,
    needsLife,
  };
}

/** Each pool's capital set-aside and maintenance from the active assets on it. A pool with no asset has none. */
export function assetAnnualCosts(
  assets: readonly AssetLike[],
  lines: readonly FundingLineLike[] = [],
): Record<string, PoolCapital> {
  const pools: Record<string, PoolCapital> = {};
  for (const asset of assets) {
    if (!asset.active) continue;
    const cost = assetAnnualCost(asset, lines);
    const pool = (pools[asset.pool_id] ??= {
      poolId: asset.pool_id,
      capital: 0,
      maintenance: 0,
      assets: [],
    });
    pool.capital = exactAmount(pool.capital + cost.capital);
    pool.maintenance = exactAmount(pool.maintenance + cost.maintenance);
    pool.assets.push(cost);
  }
  return pools;
}

export interface OverlapWarning {
  poolId: string;
  /** The budget lines that fund this pool's replacement. */
  lines: string[];
  /** The register's capital set-aside still counted for the pool. */
  capital: number;
  message: string;
}

/**
 * The advisory double-count check (§20.4): a pool whose replacement is funded by
 * a budget line and also carries a capital set-aside from the register is
 * recovering replacement twice unless the line names the assets it funds. A
 * warning, never a block; and nothing is excluded here — exclusion is the
 * explicit linkage `assetAnnualCost` already applied.
 */
export function overlapWarnings(
  pools: Record<string, PoolCapital>,
  lines: readonly FundingLineLike[],
  poolName: (poolId: string) => string,
): OverlapWarning[] {
  const warnings: OverlapWarning[] = [];
  for (const pool of Object.values(pools)) {
    if (pool.capital <= 0) continue;
    const funding = lines.filter((line) => line.funds_pool_id === pool.poolId && line.value > 0);
    if (funding.length === 0) continue;
    const labels = funding.map((line) => line.label);
    warnings.push({
      poolId: pool.poolId,
      lines: labels,
      capital: pool.capital,
      message: `${poolName(pool.poolId)}: the asset register sets aside ${formatCurrency(
        pool.capital,
      )} a year to replace its assets, and ${labels.join(", ")} also fund${
        labels.length === 1 ? "s" : ""
      } its replacement. Review for a double count — name the assets the line funds to leave them out of the set-aside.`,
    });
  }
  return warnings;
}


/** The assets that carry a replacement cost but no realistic useful life, in the register's order. */
export function assetsNeedingLife(assets: readonly AssetLike[]): AssetLike[] {
  return assets.filter(
    (asset) =>
      asset.active && Number(asset.replacement_cost ?? 0) > 0 && Number(asset.useful_life_years ?? 0) <= 0,
  );
}

/** The stored pool snapshot against what the register says now: whether a refresh would change it. */
export function snapshotIsStale(
  stored: { capital_annual: number; maintenance_annual: number },
  live: PoolCapital | undefined,
): boolean {
  const capital = live?.capital ?? 0;
  const maintenance = live?.maintenance ?? 0;
  return (
    exactAmount(Number(stored.capital_annual)) !== capital ||
    exactAmount(Number(stored.maintenance_annual)) !== maintenance
  );
}
