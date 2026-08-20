import { requireToolAccess } from "@/lib/auth/authz";

/**
 * Full-bleed, unlike every other tool's layout — the canvas needs the space,
 * and it does its own internal panning rather than relying on page scroll.
 * `h-[calc(100vh-4rem)]` subtracts PortalNav's own fixed `h-16` header rather
 * than depending on percentage height inheriting through `main`, which has
 * no explicit height of its own.
 */
export default async function EditorialInquiryLayout({ children }: { children: React.ReactNode }) {
  await requireToolAccess("editorial-inquiry");

  return <div className="h-[calc(100vh-4rem)] overflow-hidden">{children}</div>;
}
