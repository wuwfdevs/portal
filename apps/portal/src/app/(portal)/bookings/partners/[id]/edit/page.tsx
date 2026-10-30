import { notFound, redirect } from "next/navigation";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { partnerHref } from "@/lib/bookings/paths";
import { getPartner } from "@/lib/bookings/queries";
import { updatePartner } from "../../actions";
import { PartnerForm } from "../../partner-form";
import { PageHeader } from "@/components/ui/page-header";

/** Edit a partner: the same form as `/partners/new`. */
export default async function EditPartnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }, context] = await Promise.all([
    params,
    searchParams,
    requireBookingsAccess(),
  ]);
  if (!context.isProduction && !context.isDirector && !context.isExecutive)
    redirect(partnerHref(id));
  const partner = await getPartner(id);
  if (!partner) notFound();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader back={{ href: partnerHref(id), label: partner.name }} title="Edit the partner" />
      <PartnerForm
        action={updatePartner}
        partner={partner}
        submitLabel="Save"
        cancelHref={partnerHref(id)}
        error={error}
      />
    </div>
  );
}
