import { notFound, redirect } from "next/navigation";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { agreementHref } from "@/lib/bookings/paths";
import { getAgreementDetail } from "@/lib/bookings/queries";
import { updateAgreement } from "../../../../actions";
import { AgreementForm } from "../../agreement-form";
import { PageHeader } from "@/components/ui/page-header";

/** Edit an agreement: the same form as `/agreements/new`; an approved agreement's terms are the executive's. */
export default async function EditAgreementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; agreementId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id, agreementId }, { error }, context] = await Promise.all([
    params,
    searchParams,
    requireBookingsAccess(),
  ]);
  if (!context.isProduction && !context.isDirector && !context.isExecutive)
    redirect(agreementHref(id, agreementId));
  const detail = await getAgreementDetail(agreementId);
  if (!detail || detail.partner.id !== id) notFound();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        back={{ href: agreementHref(id, agreementId), label: detail.agreement.label }}
        title="Edit the agreement"
      />
      <AgreementForm
        action={updateAgreement}
        partnerId={id}
        agreement={detail.agreement}
        submitLabel="Save"
        cancelHref={agreementHref(id, agreementId)}
        error={error}
        termsLocked={detail.agreement.status !== "draft" && !context.isExecutive}
      />
    </div>
  );
}
