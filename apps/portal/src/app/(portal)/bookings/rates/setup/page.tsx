import { Alert } from "@/components/ui/alert";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { RATES_PATH } from "@/lib/bookings/paths";
import { listLaborClasses, listPools } from "@/lib/bookings/queries";
import { ClassCatalog, PoolCatalog } from "../catalog-sections";
import { RatesTabs } from "../rates-tabs";

type Params = { new?: string; edit_class?: string; edit_pool?: string; error?: string };

const SETUP_PATH = `${RATES_PATH}/setup`;

/**
 * Classes and pools (the Setup page): the two catalogs the rest of Bookings hangs off — labor classes
 * (who does production work, and how each class is paid) and resource pools
 * (what can be booked, in what unit, costed how). Unversioned, retired
 * rather than deleted; a new class or pool needs its figures on each version
 * (Labor and Resource pools tabs) and, for a pool, a term resource on each
 * term plan. Finance or the director keeps them.
 */
export default async function SetupPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const context = await requireBookingsAccess();
  const canEdit = context.isFinance || context.isDirector;
  const [classes, pools] = await Promise.all([listLaborClasses(), listPools()]);

  const href = (extra: Record<string, string>) => {
    const query = new URLSearchParams(extra).toString();
    return query ? `${SETUP_PATH}?${query}` : SETUP_PATH;
  };

  return (
    <div className="flex flex-col gap-6">
      <RatesTabs active="setup" versionId={null} />
      {params.error && <Alert>{params.error}</Alert>}
      <p className="max-w-3xl text-xs text-ink-500">
        The model is built from these two lists. Adding a labor class — a second producer, an
        engineer — or a pool — a podcast suite, a second studio — needs no code: add it here, give
        it figures on the draft version, and (for a pool) a resource on the term plan. Nothing is
        deleted; retire instead.
      </p>

      <ClassCatalog classes={classes} canEdit={canEdit} params={params} href={href} />
      <PoolCatalog pools={pools} canEdit={canEdit} params={params} href={href} />
    </div>
  );
}
