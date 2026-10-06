import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PrimaryLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { requireBookingsAccess } from "@/lib/bookings/access";
import {
  ASSET_BURDEN_LABEL,
  ASSET_CONDITION_LABEL,
  ASSET_FUNDING_LABEL,
} from "@/lib/bookings/labels";
import { RATES_PATH } from "@/lib/bookings/paths";
import { listAssets, listPools } from "@/lib/bookings/queries";
import { formatDollars } from "@/lib/bookings/rates";
import type { BkAssetFunding } from "@/lib/database.types";
import { RatesTabs } from "../rates-tabs";

type Params = { q?: string; pool?: string; funding?: string; version?: string };

const FUNDINGS = ["station", "foundation_gift", "grant_restricted", "uwf"] as const;

export default async function AssetsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const context = await requireBookingsAccess();
  const [assets, pools] = await Promise.all([listAssets(), listPools()]);
  const poolNames = new Map(pools.map((row) => [row.id, row.name]));
  const query = (params.q ?? "").trim().toLowerCase();
  const pool = pools.some((row) => row.id === params.pool) ? (params.pool as string) : null;
  const funding = (FUNDINGS as readonly string[]).includes(params.funding ?? "")
    ? (params.funding as BkAssetFunding)
    : null;
  const canWrite = context.isFinance || context.isDirector;

  const matching = assets.filter(
    (asset) =>
      query === "" ||
      asset.name.toLowerCase().includes(query) ||
      (asset.tag ?? "").toLowerCase().includes(query) ||
      (asset.restrictions ?? "").toLowerCase().includes(query),
  );
  const shown = matching.filter(
    (asset) =>
      (pool === null || asset.pool_id === pool) && (funding === null || asset.funding === funding),
  );
  const hrefFor = (next: { pool?: string | null; funding?: BkAssetFunding | null }) => {
    const search = new URLSearchParams();
    if (query) search.set("q", params.q ?? "");
    const nextPool = next.pool === undefined ? pool : next.pool;
    const nextFunding = next.funding === undefined ? funding : next.funding;
    if (nextPool) search.set("pool", nextPool);
    if (nextFunding) search.set("funding", nextFunding);
    const text = search.toString();
    return text ? `${RATES_PATH}/assets?${text}` : `${RATES_PATH}/assets`;
  };

  const activeAssets = assets.filter((asset) => asset.active);
  const totalAcquisition = activeAssets.reduce(
    (sum, asset) => sum + Number(asset.acquisition_cost ?? 0),
    0,
  );
  const restricted = activeAssets.filter((asset) => asset.funding === "grant_restricted").length;
  const gifts = activeAssets.filter((asset) => asset.funding === "foundation_gift").length;

  return (
    <div className="flex flex-col gap-4">
      <RatesTabs active="assets" versionId={params.version ?? null} />

      <p className="max-w-3xl text-xs text-ink-500">
        Foundation, member and restricted-grant-funded equipment is not prepaid institutional
        capacity. Pool costs stay the budget-line allocation on the Assumptions tab until this
        inventory, with UWF Budget / Controller&apos;s cost-recovery treatment for each asset,
        replaces it in a new rate model version.
      </p>

      <ListToolbar
        search={{
          placeholder: "Search asset, tag or restriction",
          label: "Search assets",
          defaultValue: params.q,
          hidden: { ...(pool ? { pool } : {}), ...(funding ? { funding } : {}) },
        }}
        filters={[
          {
            label: "Pool",
            chips: [
              { label: "All pools", href: hrefFor({ pool: null }), active: pool === null },
              ...pools
                .filter((row) => row.active || assets.some((asset) => asset.pool_id === row.id))
                .map((row) => ({
                  label: row.name.split(" / ")[0]!,
                  href: hrefFor({ pool: row.id }),
                  active: pool === row.id,
                  count: matching.filter((asset) => asset.pool_id === row.id).length,
                })),
            ],
          },
          {
            label: "Funding",
            chips: [
              { label: "Any funding", href: hrefFor({ funding: null }), active: funding === null },
              ...FUNDINGS.map((key) => ({
                label: ASSET_FUNDING_LABEL[key],
                href: hrefFor({ funding: key }),
                active: funding === key,
                count: matching.filter((asset) => asset.funding === key).length,
              })),
            ],
          },
        ]}
      >
        {canWrite && (
          <PrimaryLink href={`${RATES_PATH}/assets/new`}>
            <span>
              + New<span className="max-sm:sr-only"> asset</span>
            </span>
          </PrimaryLink>
        )}
      </ListToolbar>

      {shown.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          {assets.length === 0 ? "No assets inventoried yet." : "No assets match."}
        </div>
      ) : (
        <TableFrame>
          <Table stack>
            <thead>
              <HeaderRow>
                <Th>Asset</Th>
                <Th>Pool</Th>
                <Th>Acquired</Th>
                <Th className="text-right">Cost</Th>
                <Th>Funding</Th>
                <Th className="text-right">Replacement · maintenance</Th>
                <Th className="text-right">Useful life</Th>
                <Th>Restrictions</Th>
                <Th>Maintenance</Th>
                <Th>Condition</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {shown.map((asset) => (
                <Row key={asset.id} className={asset.active ? undefined : "text-ink-400"}>
                  <Cell stack="title">
                    {canWrite ? (
                      <Link
                        href={`${RATES_PATH}/assets/${asset.id}/edit`}
                        className="font-semibold text-brand-link hover:underline"
                      >
                        {asset.name}
                      </Link>
                    ) : (
                      <span className="font-semibold text-ink-900">{asset.name}</span>
                    )}
                    {asset.tag && (
                      <span className="ml-2 text-xs text-ink-400">tag {asset.tag}</span>
                    )}
                  </Cell>
                  <Cell label="Pool">{(poolNames.get(asset.pool_id) ?? "—").split(" / ")[0]}</Cell>
                  <Cell label="Acquired">
                    {asset.acquired_on
                      ? new Date(`${asset.acquired_on}T00:00:00`).toLocaleDateString("en-US", {
                          month: "short",
                          year: "numeric",
                        })
                      : asset.annual_cost
                        ? "annual"
                        : "—"}
                  </Cell>
                  <Cell label="Cost" className="text-right tabular-nums">
                    {asset.acquisition_cost !== null
                      ? formatDollars(Number(asset.acquisition_cost))
                      : asset.annual_cost !== null
                        ? `${formatDollars(Number(asset.annual_cost))} / yr`
                        : "—"}
                  </Cell>
                  <Cell label="Funding">
                    <Badge
                      variant={
                        asset.funding === "station" || asset.funding === "uwf"
                          ? "neutral"
                          : "warning"
                      }
                    >
                      {ASSET_FUNDING_LABEL[asset.funding]}
                    </Badge>
                  </Cell>
                  <Cell label="Replacement · maintenance" className="text-right tabular-nums">
                    {asset.replacement_cost !== null
                      ? formatDollars(Number(asset.replacement_cost))
                      : "—"}
                    <span className="text-ink-400">
                      {" · "}
                      {asset.annual_maintenance !== null
                        ? `${formatDollars(Number(asset.annual_maintenance))} / yr`
                        : "—"}
                    </span>
                  </Cell>
                  <Cell label="Useful life" className="text-right tabular-nums">
                    {asset.useful_life_years !== null
                      ? `${Number(asset.useful_life_years)} yr`
                      : "—"}
                  </Cell>
                  <Cell label="Restrictions" className="text-xs text-ink-500">
                    {asset.restrictions ?? "none"}
                  </Cell>
                  <Cell label="Maintenance">{ASSET_BURDEN_LABEL[asset.maintenance_burden]}</Cell>
                  <Cell label="Condition" stack="aside">
                    <Badge
                      variant={
                        asset.condition === "good"
                          ? "success"
                          : asset.condition === "out_of_service"
                            ? "muted"
                            : "warning"
                      }
                    >
                      {ASSET_CONDITION_LABEL[asset.condition]}
                    </Badge>
                  </Cell>
                </Row>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}

      <p className="text-xs text-ink-500">
        {activeAssets.length} active asset{activeAssets.length === 1 ? "" : "s"} ·{" "}
        {formatDollars(totalAcquisition)} acquisition cost · {restricted} restricted, {gifts} gift
        {gifts === 1 ? "" : "s"}. An asset&apos;s pool, life and treatment become that pool&apos;s
        cost per unit in the next rate model version.
      </p>
    </div>
  );
}
