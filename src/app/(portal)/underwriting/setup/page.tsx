import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { requireUnderwritingAccess } from "@/lib/underwriting/access";
import { listIndustryCategories, listInventoryPools } from "@/lib/underwriting/queries";
import { poolReachability } from "@/lib/underwriting/pool-targets";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function SetupCard({
  href,
  title,
  description,
  status,
}: {
  href: string;
  title: string;
  description: string;
  status?: ReactNode;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="flex h-full flex-col gap-1.5 px-5 py-4 group-hover:border-brand-primary">
        <span className="text-sm font-bold text-brand-link group-hover:underline">{title}</span>
        <span className="text-[13px] text-ink-500">{description}</span>
        {status && (
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-400">
            {status}
          </span>
        )}
      </Card>
    </Link>
  );
}

/**
 * Setup: the reference lists the rest of Underwriting depends on (inventory
 * pools, industries), and — for administrators — the one-time imports from
 * RadioTraffic. Reached from the tab row; each page under it links back here.
 */
export default async function UnderwritingSetupPage() {
  const context = await requireUnderwritingAccess();
  const supabase = await createClient();

  const [pools, categories, uncategorized, migrationLabels] = await Promise.all([
    listInventoryPools(),
    listIndustryCategories(),
    supabase
      .from("uw_underwriters")
      .select("id", { count: "exact", head: true })
      .is("category_id", null)
      .then((result) => {
        unwrapRead(result, "the underwriters without an industry");
        return result.count ?? 0;
      }),
    context.isAdministrator
      ? supabase
          .from("uw_agreement_migration_items")
          .select("batch_label, status")
          .then((result) => unwrapRead(result, "the migration batches") ?? [])
      : Promise.resolve([] as { batch_label: string; status: string }[]),
  ]);

  const activePools = pools.filter((pool) => pool.active);
  // A pool on its own can reach a break only through a target; with none,
  // poolReachability reports no_targets for any line that names it.
  const unreachablePools = activePools.filter(
    (pool) =>
      poolReachability(pool.targets, {
        program_id: null,
        days_of_week: [],
        time_mode: "any",
        preferred_time: null,
        window_start: null,
        window_end: null,
      }).kind !== "reachable",
  ).length;
  const activeCategories = categories.filter((category) => category.active).length;
  const batchCount = new Set(migrationLabels.map((item) => item.batch_label)).size;
  const entriesToImport = migrationLabels.filter((item) => item.status !== "imported").length;

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h2 className="font-serif text-xl font-bold text-ink-900">Setup</h2>
        <p className="mt-1 max-w-[720px] text-[13px] text-ink-500">
          The lists the rest of the tool depends on, and the one-time imports from RadioTraffic.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
          Reference lists
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <SetupCard
            href="/underwriting/setup/pools"
            title="Inventory pools"
            description="What an order’s “AM Drive” or “Carpool” means in Log programs and time windows."
            status={
              <>
                <span>{plural(activePools.length, "pool", "pools")}</span>
                {unreachablePools > 0 && (
                  <>
                    <span>· {unreachablePools} can’t reach a break</span>
                    <Badge variant="warning">Needs a mapping</Badge>
                  </>
                )}
              </>
            }
          />
          <SetupCard
            href="/underwriting/setup/industries"
            title="Industries"
            description="The categories auto-fill uses to keep competing underwriters out of the same break."
            status={
              <span>
                {plural(activeCategories, "industry", "industries")} ·{" "}
                {plural(uncategorized, "underwriter", "underwriters")} without one
              </span>
            }
          />
        </div>
      </section>

      {context.isAdministrator && (
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Imports</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <SetupCard
              href="/underwriting/setup/migration"
              title="Import agreements"
              description="Bring legacy signed agreements in as draft contracts, in batches."
              status={
                <span>
                  {plural(batchCount, "batch", "batches")}
                  {entriesToImport > 0 &&
                    ` · ${plural(entriesToImport, "entry", "entries")} still to import`}
                </span>
              }
            />
            <SetupCard
              href="/underwriting/setup/migration/copy"
              title="Import copy"
              description="Seed active copy from RadioTraffic’s “Active Copy by Underwriter” export."
            />
          </div>
        </section>
      )}
    </div>
  );
}
