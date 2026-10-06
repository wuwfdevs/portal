import { TabNav } from "@/components/ui/tab-nav";
import { RATES_SECTIONS, ratesHref, type RatesSection } from "@/lib/bookings/paths";

/**
 * The Rates section's second-level row (the shape of On Air's ScheduleTabs):
 * the versioned views carry the chosen version through the query string;
 * Assets and the Change log are not versioned and drop it.
 */
export function RatesTabs({
  active,
  versionId,
}: {
  active: RatesSection;
  versionId: string | null;
}) {
  return (
    <TabNav
      className="mb-4"
      tabs={RATES_SECTIONS.map((section) => ({
        href: ratesHref(section.key, section.versioned ? versionId : null),
        label: section.label,
        active: active === section.key,
      }))}
    />
  );
}
