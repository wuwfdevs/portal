import { notFound, redirect } from "next/navigation";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { RATES_PATH } from "@/lib/bookings/paths";
import { getAsset, listPools } from "@/lib/bookings/queries";
import { updateAsset } from "../../../actions";
import { RatesTabs } from "../../../rates-tabs";
import { AssetForm } from "../../asset-form";

export default async function EditAssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const context = await requireBookingsAccess();
  if (!context.isFinance && !context.isDirector) redirect(`${RATES_PATH}/assets`);
  const [asset, pools] = await Promise.all([getAsset(id), listPools()]);
  if (!asset) notFound();

  return (
    <div className="flex flex-col gap-4">
      <RatesTabs active="assets" versionId={null} />
      <h3 className="text-sm font-bold text-ink-900">Edit {asset.name}</h3>
      <AssetForm
        action={updateAsset}
        defaults={asset}
        pools={pools}
        submitLabel="Save asset"
        cancelHref={`${RATES_PATH}/assets`}
        error={error}
      />
    </div>
  );
}
