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
  if (tool.status === "available") redirect(tool.route);

  return <ToolPlaceholder tool={tool} />;
}
