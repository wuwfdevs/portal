import { redirect } from "next/navigation";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { PARTNERS_PATH } from "@/lib/bookings/paths";
import { createPartner } from "../actions";
import { PartnerForm } from "../partner-form";
import { PageHeader } from "@/components/ui/page-header";

export default async function NewPartnerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, context] = await Promise.all([searchParams, requireBookingsAccess()]);
  if (!context.isProduction && !context.isDirector && !context.isExecutive) redirect(PARTNERS_PATH);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader back={{ href: PARTNERS_PATH, label: "Partners" }} title="New partner" />
      <PartnerForm
        action={createPartner}
        submitLabel="Add partner"
        cancelHref={PARTNERS_PATH}
        error={error}
      />
    </div>
  );
}
