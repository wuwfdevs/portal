import Link from "next/link";
import { redirect } from "next/navigation";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { PARTNERS_PATH } from "@/lib/bookings/paths";
import { createPartner } from "../actions";
import { PartnerForm } from "../partner-form";

export default async function NewPartnerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, context] = await Promise.all([searchParams, requireBookingsAccess()]);
  if (!context.isProduction && !context.isDirector && !context.isExecutive) redirect(PARTNERS_PATH);
  return (
    <div className="flex flex-col gap-4">
      <Link href={PARTNERS_PATH} className="inline-block text-xs font-semibold text-brand-link">
        ← Partners
      </Link>
      <h2 className="font-serif text-[17px] font-bold text-ink-900">New partner</h2>
      <PartnerForm
        action={createPartner}
        submitLabel="Add partner"
        cancelHref={PARTNERS_PATH}
        error={error}
      />
    </div>
  );
}
