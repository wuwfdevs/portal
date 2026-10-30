import { notFound, redirect } from "next/navigation";
import { getToolByKey } from "@/lib/tools";
import { ToolPlaceholder } from "@/components/tool-placeholder";

// Generic coming-soon placeholder for any registered tool that isn't built
// yet. Adding a new tool row to `tools` automatically gets one of these for
// free at /tools/<key> until it has a real route of its own.
export default async function ToolPlaceholderPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = await getToolByKey(slug);
  if (!tool) notFound();

  // Only redirect somewhere else. A tool marked 'available' whose route is
  // still this placeholder redirects to itself — an infinite loop the browser
  // reports as ERR_TOO_MANY_REDIRECTS, with nothing on screen to explain it.
  // That is one click away in the admin registry screen (/admin/tools/[id]/edit
  // lets status and route be changed independently), and it is exactly what
  // happened when Audience Listening was flipped to 'available' before its
  // migration had repointed the route. Falling through to the placeholder makes
  // the misconfiguration visible instead of fatal.
  if (tool.status === "available" && tool.route !== `/tools/${slug}`) {
    redirect(tool.route);
  }

  return <ToolPlaceholder tool={tool} />;
}
