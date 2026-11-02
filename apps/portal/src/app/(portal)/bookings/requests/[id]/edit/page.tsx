import { notFound, redirect } from "next/navigation";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { requestHref } from "@/lib/bookings/paths";
import { getProjectDetail, listPartners } from "@/lib/bookings/queries";
import { updateRequest } from "../../actions";
import { RequestForm } from "../../request-form";
import { PageHeader } from "@/components/ui/page-header";

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
      <PageHeader
        back={{ href: requestHref(id), label: detail.project.title }}
        title="Edit the request"
      />
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
