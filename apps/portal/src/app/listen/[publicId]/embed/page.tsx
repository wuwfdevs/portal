import type { Metadata } from "next";
import { ListenPageContent, listenMetadata } from "../listen-page-content";

/**
 * The iframe variant, for a Grove Responsive Embed. Identical flow, chrome
 * dropped — see ListenShell for what differs and why.
 *
 * `robots: noindex` because this URL only exists to be framed: indexed on its
 * own it would compete with the article that embeds it, and with the standalone
 * page, for the same content.
 *
 * The frame-ancestors header that permits cross-origin framing is set for
 * /listen/* in next.config.ts, not here.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicId: string }>;
}): Promise<Metadata> {
  const { publicId } = await params;
  return { ...(await listenMetadata(publicId)), robots: { index: false, follow: false } };
}

export default async function ListenEmbedPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  return <ListenPageContent publicId={publicId} embedded />;
}
