import Link from "next/link";
import { TabNav } from "@/components/ui/tab-nav";
import { INPUT_SECTIONS, ratesHref, ratesTabFor, type RatesSection } from "@/lib/bookings/paths";

/**
 * The Rates section's second-level row: Rate card · Inputs · History, with the
 * unversioned catalogs (Assets, Classes and pools) behind the row's "⋯" menu.
 * The four editors are reached from the Inputs checklist, so they light Inputs
 * and carry a "← Inputs" link back instead of four tabs of their own
 * (docs/bookings-design.md §23). The versioned views carry the chosen version
 * through the query string; History and the catalogs drop it.
 */
export function RatesTabs({
  active,
  versionId,
}: {
  active: RatesSection | "inputs";
  versionId: string | null;
}) {
  const tab = ratesTabFor(active);
  const isEditor = (INPUT_SECTIONS as readonly string[]).includes(active);
  return (
    <div className="mb-4 flex flex-col gap-2">
      <TabNav
        tabs={[
          { href: ratesHref("card", versionId), label: "Rate card", active: tab === "card" },
          { href: ratesHref("inputs", versionId), label: "Inputs", active: tab === "inputs" },
          { href: ratesHref("changes", null), label: "History", active: tab === "history" },
          {
            href: ratesHref("assets", null),
            label: "Assets",
            active: active === "assets",
            forceMore: true,
          },
          {
            href: ratesHref("setup", null),
            label: "Classes and pools",
            active: active === "setup",
            forceMore: true,
          },
        ]}
      />
      {isEditor && (
        <Link
          href={ratesHref("inputs", versionId)}
          className="self-start text-xs font-semibold text-brand-link hover:underline"
        >
          ← Inputs
        </Link>
      )}
    </div>
  );
}
