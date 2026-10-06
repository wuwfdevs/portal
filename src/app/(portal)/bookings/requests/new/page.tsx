import Link from "next/link";
import { redirect } from "next/navigation";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { REQUESTS_PATH } from "@/lib/bookings/paths";
import { listPartners } from "@/lib/bookings/queries";
import { createRequest } from "../actions";
import { RequestForm } from "../request-form";

/** A request entered by staff (docs/bookings-design.md §3C); the public form arrives in slice 4. */
export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, context] = await Promise.all([searchParams, requireBookingsAccess()]);
  if (!context.isProduction && !context.isDirector && !context.isExecutive) redirect(REQUESTS_PATH);
  const partners = await listPartners();
  return (
    <div className="flex flex-col gap-4">
      <Link href={REQUESTS_PATH} className="inline-block text-xs font-semibold text-brand-link">
        ← Requests
      </Link>
      <h2 className="font-serif text-[17px] font-bold text-ink-900">New request</h2>
      <RequestForm
        action={createRequest}
        partners={partners}
        error={error}
        cancelHref={REQUESTS_PATH}
      />
    </div>
  );
}
