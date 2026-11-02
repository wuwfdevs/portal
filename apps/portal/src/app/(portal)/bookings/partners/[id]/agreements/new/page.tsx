import { notFound, redirect } from "next/navigation";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { partnerHref } from "@/lib/bookings/paths";
import { getPartner } from "@/lib/bookings/queries";
import { createAgreement } from "../../../actions";
import { AgreementForm } from "../agreement-form";
import { PageHeader } from "@/components/ui/page-header";

/** Draft an agreement for a partner (docs/bookings-design.md §3H); the executive approves it on its page. */
export default async function NewAgreementPage({
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
      <PageHeader back={{ href: partnerHref(id), label: partner.name }} title="New agreement" />
      <p className="max-w-3xl text-sm text-ink-700">
        An agreement is drafted here and approved by the Executive Director on its page, where its
        draw on the term — the reserve share, the airtime, the windows its reserved blocks take — is
        shown before signature. Nothing is reserved or priced under it until it is approved.
      </p>
      <AgreementForm
        action={createAgreement}
        partnerId={id}
        submitLabel="Draft the agreement"
        cancelHref={partnerHref(id)}
        error={error}
        termsLocked={false}
      />
    </div>
  );
}
