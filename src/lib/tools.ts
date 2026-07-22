import "server-only";
import { createClient } from "@/lib/supabase/server";
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

  return (tools ?? []).map((tool) => ({
    tool,
    hasAccess: accessByToolId.has(tool.id),
    toolRole: accessByToolId.get(tool.id) ?? null,
  }));
}

export async function getToolByKey(key: string): Promise<Tool | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("tools").select("*").eq("key", key).maybeSingle();
  return data;
}
