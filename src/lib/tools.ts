import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  compareToolsForDashboard,
  grantRequiredForTool,
  isListedOnDashboard,
} from "@/lib/tool-access-rules";
import type { Database } from "@/lib/database.types";

export type Tool = Database["public"]["Tables"]["tools"]["Row"];

export interface ToolWithAccess {
  tool: Tool;
  hasAccess: boolean;
  toolRole: string | null;
}

/** Enabled tools visible to the current user, each annotated with their access state. */
export async function listToolsForCurrentUser(userId: string): Promise<ToolWithAccess[]> {
  const supabase = await createClient();

  const [{ data: tools }, { data: access }] = await Promise.all([
    supabase.from("tools").select("*").order("sort_order"),
    supabase
      .from("tool_access")
      .select("tool_id, tool_role")
      .eq("user_id", userId)
      .is("revoked_at", null),
  ]);

  const accessByToolId = new Map((access ?? []).map((row) => [row.tool_id, row.tool_role]));

  // A 'proposed' tool is an idea filed on the Roadmap, not software — RLS
  // shows it to Roadmap members so a post can target it, and it must not
  // become a dashboard card. `hasAccess` additionally honors a registry row
  // that is open to all active staff; both rules live in tool-access-rules.ts.
  // `hasAccess` is deliberately about the grant/open-access question alone —
  // whether the registry row is currently enabled is a separate axis that
  // ToolCard reads straight off `tool.enabled` (see getToolCardState), the
  // same thing canOpenTool in lib/auth/authz.ts checks for the actual gate.
  return (tools ?? [])
    .filter(isListedOnDashboard)
    .sort(compareToolsForDashboard)
    .map((tool) => ({
      tool,
      hasAccess: accessByToolId.has(tool.id) || !grantRequiredForTool(tool),
      toolRole: accessByToolId.get(tool.id) ?? null,
    }));
}

export async function getToolByKey(key: string): Promise<Tool | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("tools").select("*").eq("key", key).maybeSingle();
  return data;
}
