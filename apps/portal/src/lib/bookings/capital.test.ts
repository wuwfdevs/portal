import { describe, expect, it } from "vitest";
import {
  assetAnnualCost,
  assetAnnualCosts,
  assetsNeedingLife,
  overlapWarnings,
  snapshotIsStale,
  type AssetLike,
  type FundingLineLike,
} from "./capital";

function asset(overrides: Partial<AssetLike> & { id: string }): AssetLike {
  return {
    name: overrides.id,
    pool_id: "studio",
    active: true,
    replacement_cost: null,
    useful_life_years: null,
    annual_maintenance: null,
    ...overrides,
  };
}

describe("assetAnnualCost — economic capital consumption", () => {
  it("is replacement cost over realistic useful life, plus maintenance", () => {
    expect(
      assetAnnualCost(
        asset({ id: "cam", replacement_cost: 12000, useful_life_years: 6, annual_maintenance: 300 }),
      ),
    ).toMatchObject({ capital: 2000, maintenance: 300, coveredBy: null, needsLife: false });
  });

  it("adds zero for blank fields", () => {
    expect(assetAnnualCost(asset({ id: "blank" }))).toMatchObject({ capital: 0, maintenance: 0 });
    expect(assetAnnualCost(asset({ id: "m", annual_maintenance: 150 }))).toMatchObject({
      capital: 0,
      maintenance: 150,
    });
  });

  it("adds no capital for a replacement cost with no life, and says it needs one", () => {
    const cost = assetAnnualCost(asset({ id: "x", replacement_cost: 5000 }));
    expect(cost).toMatchObject({ capital: 0, needsLife: true });
  });

  it("leaves capital out only where a budget line names the asset, and still counts its maintenance", () => {
    const lines: FundingLineLike[] = [
      { id: "l", label: "Equipment contingency", value: 7000, funds_pool_id: "studio", asset_ids: ["cam"] },
    ];
    expect(
      assetAnnualCost(
        asset({ id: "cam", replacement_cost: 12000, useful_life_years: 6, annual_maintenance: 300 }),
        lines,
      ),
    ).toMatchObject({ capital: 0, maintenance: 300, coveredBy: "Equipment contingency" });
  });
});

describe("assetAnnualCosts — a pool's totals", () => {
  const assets = [
    asset({ id: "a", pool_id: "studio", replacement_cost: 12000, useful_life_years: 6, annual_maintenance: 300 }),
    asset({ id: "b", pool_id: "studio", replacement_cost: 4500, useful_life_years: 9 }),
    asset({ id: "c", pool_id: "field", replacement_cost: 8000, useful_life_years: 4 }),
    asset({ id: "gone", pool_id: "studio", active: false, replacement_cost: 99999, useful_life_years: 1 }),
  ];
  it("sums active assets by pool and ignores retired ones", () => {
    const pools = assetAnnualCosts(assets);
    expect(pools.studio).toMatchObject({ capital: 2500, maintenance: 300 });
    expect(pools.field).toMatchObject({ capital: 2000, maintenance: 0 });
    expect(pools.studio!.assets.map((a) => a.assetId)).toEqual(["a", "b", "gone"].slice(0, 2));
  });
  it("has nothing for a pool with no assets", () => {
    expect(assetAnnualCosts(assets).edit).toBeUndefined();
  });
});

describe("overlapWarnings — the advisory double-count check", () => {
  const assets = [asset({ id: "a", replacement_cost: 12000, useful_life_years: 6 })];
  const namePool = (id: string) => (id === "studio" ? "Studio" : id);

  it("warns when a budget line funds the pool's replacement and the register also sets capital aside", () => {
    const lines: FundingLineLike[] = [
      { id: "l", label: "Equipment contingency", value: 7000, funds_pool_id: "studio", asset_ids: [] },
    ];
    const warnings = overlapWarnings(assetAnnualCosts(assets, lines), lines, namePool);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain("Review for a double count");
    expect(warnings[0]).toMatchObject({ poolId: "studio", lines: ["Equipment contingency"], capital: 2000 });
  });

  it("excludes nothing silently: naming only the pool leaves the capital in", () => {
    const lines: FundingLineLike[] = [
      { id: "l", label: "Hardware", value: 2000, funds_pool_id: "studio", asset_ids: [] },
    ];
    expect(assetAnnualCosts(assets, lines).studio!.capital).toBe(2000);
  });

  it("is quiet once the line names the asset (explicit linkage), and when nothing funds the pool", () => {
    const named: FundingLineLike[] = [
      { id: "l", label: "Hardware", value: 2000, funds_pool_id: "studio", asset_ids: ["a"] },
    ];
    expect(overlapWarnings(assetAnnualCosts(assets, named), named, namePool)).toEqual([]);
    expect(overlapWarnings(assetAnnualCosts(assets, []), [], namePool)).toEqual([]);
  });

  it("ignores a line with no value and one that funds another pool", () => {
    const lines: FundingLineLike[] = [
      { id: "z", label: "Zero", value: 0, funds_pool_id: "studio", asset_ids: [] },
      { id: "f", label: "Field kit", value: 900, funds_pool_id: "field", asset_ids: [] },
    ];
    expect(overlapWarnings(assetAnnualCosts(assets, lines), lines, namePool)).toEqual([]);
  });
});

describe("assetsNeedingLife and snapshotIsStale", () => {
  it("lists active assets with a replacement cost and no life", () => {
    expect(
      assetsNeedingLife([
        asset({ id: "a", replacement_cost: 100 }),
        asset({ id: "b", replacement_cost: 100, useful_life_years: 5 }),
        asset({ id: "c", replacement_cost: 100, active: false }),
      ]).map((a) => a.id),
    ).toEqual(["a"]);
  });

  it("is stale when the register would change the stored figures", () => {
    const live = assetAnnualCosts([asset({ id: "a", replacement_cost: 12000, useful_life_years: 6 })]).studio;
    expect(snapshotIsStale({ capital_annual: 2000, maintenance_annual: 0 }, live)).toBe(false);
    expect(snapshotIsStale({ capital_annual: 0, maintenance_annual: 0 }, live)).toBe(true);
    expect(snapshotIsStale({ capital_annual: 0, maintenance_annual: 0 }, undefined)).toBe(false);
  });
});
