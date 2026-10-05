import { redirect } from "next/navigation";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { RATES_PATH } from "@/lib/bookings/paths";
import { listPools } from "@/lib/bookings/queries";
import { createAsset } from "../../actions";
import { RatesTabs } from "../../rates-tabs";
import { AssetForm } from "../asset-form";

export default async function NewAssetPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const context = await requireBookingsAccess();
  if (!context.isFinance && !context.isDirector) redirect(`${RATES_PATH}/assets`);
  const pools = await listPools();

  return (
    <div className="flex flex-col gap-4">
      <RatesTabs active="assets" versionId={null} />
      <h3 className="text-sm font-bold text-ink-900">New asset</h3>
      <AssetForm
        action={createAsset}
        pools={pools}
        submitLabel="Add asset"
        cancelHref={`${RATES_PATH}/assets`}
        error={error}
      />
    </div>
  );
}
