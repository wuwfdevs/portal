import type { Metadata } from "next";
import { BOOK_PAGE_TITLE, BookPageContent } from "../book-page-content";

/**
 * The iframe variant, for a Grove Responsive Embed. Identical flow, chrome
 * dropped — see BookShell for what differs and why. noindex because this URL
 * only exists to be framed. The frame-ancestors header that permits
 * cross-origin framing is set for /book/* in next.config.ts, not here.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: BOOK_PAGE_TITLE,
  robots: { index: false, follow: false },
};

export default function BookEmbedPage() {
  return <BookPageContent embedded />;
}
