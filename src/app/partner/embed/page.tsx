import type { Metadata } from "next";
import { PartnerPageContent } from "../partner-page-content";

/**
 * The iframe variant, for a Grove Responsive Embed. Identical flow, chrome
 * dropped — see PartnerShell for what differs and why.
 *
 * robots: noindex because this URL only exists to be framed: indexed on its
 * own it would compete with the article that embeds it and the standalone
 * page for the same content.
 *
 * The frame-ancestors header that permits cross-origin framing is set for
 * /partner/* in next.config.ts, not here.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WUWF Applied Media Partnership Program",
  robots: { index: false, follow: false },
};

export default function PartnerEmbedPage() {
  return <PartnerPageContent embedded />;
}
