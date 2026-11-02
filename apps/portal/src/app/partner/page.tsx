import type { Metadata } from "next";
import { PartnerPageContent } from "./partner-page-content";

/**
 * The standalone public inquiry form (design doc §6).
 *
 * Outside both (portal) and (auth), and listed in the middleware's
 * PUBLIC_PATHS, for the same reason /listen/[publicId] is: a faculty
 * submitter has no profile, never signs in through /login, and must never
 * see portal chrome.
 *
 * Dynamic because open/closed state and copy change between renders — a
 * cached "open" page would keep accepting submissions after it closed, the
 * same mistake /listen guards against.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WUWF Applied Media Partnership Program",
  description:
    "Propose a classroom visit, applied project, internship, or research partnership with WUWF.",
};

export default function PartnerPage() {
  return <PartnerPageContent embedded={false} />;
}
