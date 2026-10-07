import Link from "next/link";
import { SubNav } from "@/components/ui/sub-nav";
import { INPUT_SECTIONS, ratesHref, ratesTabFor, type RatesSection } from "@/lib/bookings/paths";

/**
 * The Rates section's second-level row (a `SubNav`): Rate card · Inputs ·
 * History · Assets (the labor class and pool catalogs live on the Labor and
 * Resource pools pages).
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
      <SubNav
        label="Rates sections"
        className="mb-0"
        items={[
          { href: ratesHref("card", versionId), label: "Rate card", active: tab === "card" },
          { href: ratesHref("inputs", versionId), label: "Inputs", active: tab === "inputs" },
          { href: ratesHref("changes", null), label: "History", active: tab === "history" },
          { href: ratesHref("assets", null), label: "Assets", active: active === "assets" },
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
