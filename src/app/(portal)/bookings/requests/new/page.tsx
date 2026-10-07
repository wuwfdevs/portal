import { redirect } from "next/navigation";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { calendarStateFrom } from "@/lib/bookings/estimate";
import { isOfferable } from "@/lib/bookings/estimate-lines";
import { timeOfDayOptions } from "@/lib/bookings/booking-plan";
import { PARTNER_KIND_LABEL } from "@/lib/bookings/projects";
import { REQUESTS_PATH } from "@/lib/bookings/paths";
import {
  getCurrentPlan,
  getPlanCalendar,
  getPricingContext,
  listPartners,
} from "@/lib/bookings/queries";
import { hoursPhrase, hourBuckets } from "@/lib/bookings/summary";
import { createRequest } from "../actions";
import { NewRequestForm } from "../new-request-form";
import { PageHeader } from "@/components/ui/page-header";

/**
 * A request entered by staff, priced in the same pass (docs/bookings-design.md
 * §3C, §18.1): the partner, the service, the date. Nothing else is asked
 * until it is needed.
 */
export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, context] = await Promise.all([searchParams, requireBookingsAccess()]);
  if (!context.isProduction && !context.isDirector && !context.isExecutive) redirect(REQUESTS_PATH);
  const [partners, pricing, plan] = await Promise.all([
    listPartners(),
    getPricingContext(null),
    getCurrentPlan(),
  ]);
  const state = plan
    ? calendarStateFrom(await getPlanCalendar(plan), new Date().toISOString())
    : null;
  const packages = (pricing?.packages ?? [])
    .filter((pkg) => isOfferable(pkg, null))
    .map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      unitLabel: pkg.unit_label,
      includes:
        hoursPhrase(
          hourBuckets(
            [
              {
                quantity: 1,
                labor_hours: Object.fromEntries(pkg.labor.map((l) => [l.labor_class_id, l.hours])),
              },
            ],
            pricing?.classes ?? [],
          ),
        ) ?? "Equipment and space",
    }));
  return (
    <div className="flex flex-col gap-4">
      <PageHeader back={{ href: REQUESTS_PATH, label: "Requests" }} title="New request" />
      <NewRequestForm
        action={createRequest}
        partners={partners.map((partner) => ({
          id: partner.id,
          name: partner.name,
          kind: partner.kind,
          kindLabel: PARTNER_KIND_LABEL[partner.kind],
          contactName: partner.contact_name,
          contactEmail: partner.contact_email,
          defaultFundingIndex: partner.default_funding_index,
        }))}
        packages={packages}
        timesOfDay={
          state ? timeOfDayOptions(state).map((o) => ({ key: o.key, label: o.label })) : []
        }
        error={error}
        cancelHref={REQUESTS_PATH}
        noRateCard={pricing === null}
      />
    </div>
  );
}
