import type { Metadata } from "next";
import { BookPageContent } from "./book-page-content";
import { BOOK_PAGE_TITLE } from "./title";

/**
 * The standalone public request form (docs/bookings-design.md §6.3).
 *
 * Outside both (portal) and (auth), and listed in the middleware's
 * PUBLIC_PATHS, for the same reason /partner is: a submitter has no profile,
 * never signs in, and must never see portal chrome. No session is created
 * here, not even an anonymous one — one page load, one submit, nothing read
 * back.
 *
 * Dynamic because open/closed state and copy change between renders — a
 * cached "open" page would keep accepting requests after it closed.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: BOOK_PAGE_TITLE,
  description:
    "Ask WUWF to produce a webcast, a studio or field recording, or editing, or to air a university message.",
};

export default function BookPage() {
  return <BookPageContent embedded={false} />;
}
