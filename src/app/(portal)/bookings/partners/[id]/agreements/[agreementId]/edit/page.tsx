import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { agreementHref } from "@/lib/bookings/paths";
import { getAgreementDetail } from "@/lib/bookings/queries";
import { updateAgreement } from "../../../../actions";
import { AgreementForm } from "../../agreement-form";

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
      <Link
        href={agreementHref(id, agreementId)}
        className="inline-block text-xs font-semibold text-brand-link"
      >
        ← {detail.agreement.label}
      </Link>
      <h2 className="font-serif text-[17px] font-bold text-ink-900">Edit the agreement</h2>
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
