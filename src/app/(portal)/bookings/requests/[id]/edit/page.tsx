import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { requestHref } from "@/lib/bookings/paths";
import { getProjectDetail, listPartners } from "@/lib/bookings/queries";
import { updateRequest } from "../../actions";
import { RequestForm } from "../../request-form";

/** Edit a request's scope: the same form as `/requests/new`. */
export default async function EditRequestPage({
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
    redirect(requestHref(id));
  const [detail, partners] = await Promise.all([getProjectDetail(id), listPartners()]);
  if (!detail) notFound();
  return (
    <div className="flex flex-col gap-4">
      <Link href={requestHref(id)} className="inline-block text-xs font-semibold text-brand-link">
        ← {detail.project.title}
      </Link>
      <h2 className="font-serif text-[17px] font-bold text-ink-900">Edit the request</h2>
      <RequestForm
        action={updateRequest}
        partners={partners}
        project={detail.project}
        error={error}
        cancelHref={requestHref(id)}
      />
    </div>
  );
}
