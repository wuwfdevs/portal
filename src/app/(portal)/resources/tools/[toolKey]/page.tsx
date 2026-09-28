import { notFound, redirect } from "next/navigation";
import { listGuidesForTool } from "@/lib/resources/queries";

/** A tool's guides start at its first one. */
export default async function ToolGuidesPage({ params }: { params: Promise<{ toolKey: string }> }) {
  const { toolKey } = await params;
  const listing = await listGuidesForTool(toolKey);
  const first = listing?.guides[0];
  if (!listing || !first) notFound();
  redirect(`/resources/tools/${listing.tool.key}/${first.slug}`);
}
