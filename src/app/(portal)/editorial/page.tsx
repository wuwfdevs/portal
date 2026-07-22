import { notFound, redirect } from "next/navigation";
import { getToolByKey } from "@/lib/tools";
import { ToolPlaceholder } from "@/components/tool-placeholder";

// Dedicated placeholder route for the Editorial Planning tool (per the phase-1
// milestone). Real submission/scoring/ranking screens land here in a later
// phase — this route intentionally does nothing but explain that yet.
export default async function EditorialPlanningPage() {
  const tool = await getToolByKey("editorial-planning");
  if (!tool) notFound();
  if (tool.status === "available") redirect(tool.route);

  return <ToolPlaceholder tool={tool} />;
}
