import type { Metadata } from "next";
import { ListenPageContent, listenMetadata } from "./listen-page-content";

/**
 * The standalone public participation page (design doc §4).
 *
 * Outside both (portal) and (auth), and listed in the middleware's
 * PUBLIC_PATHS, for the same reason Remote Interview's /join/[token] is: a
 * participant has no profile, never signs in through /login, and must never see
 * portal chrome.
 *
 * Dynamic because a query's state changes between renders — a cached "open"
 * page would keep accepting people after it closed.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicId: string }>;
}): Promise<Metadata> {
  const { publicId } = await params;
  return listenMetadata(publicId);
}

export default async function ListenPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return <ListenPageContent publicId={publicId} embedded={false} />;
}
