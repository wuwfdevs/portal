"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertAdministrator } from "@/lib/auth/authz";
import { logAuditEvent } from "@/lib/audit";
import type { ToolStatus, ToolDefaultAccess } from "@/lib/database.types";

const TOOL_STATUSES: ToolStatus[] = ["available", "in_development", "planned"];
const DEFAULT_ACCESS_VALUES: ToolDefaultAccess[] = ["invite_only", "approved_staff", "open"];

export async function toggleToolEnabled(formData: FormData): Promise<void> {
  const admin = await assertAdministrator();
  const toolId = String(formData.get("tool_id") ?? "");
  const nextEnabled = String(formData.get("next_enabled") ?? "") === "true";

  const supabase = await createClient();
  await supabase.from("tools").update({ enabled: nextEnabled }).eq("id", toolId);

  await logAuditEvent({
    actorId: admin.id,
    action: nextEnabled ? "tool.enabled" : "tool.disabled",
    targetType: "tool",
    targetId: toolId,
  });

  redirect("/admin/tools");
}

export async function updateTool(formData: FormData): Promise<void> {
  const admin = await assertAdministrator();
  const toolId = String(formData.get("tool_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const route = String(formData.get("route") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "planned");
  const status = TOOL_STATUSES.includes(statusRaw as ToolStatus) ? (statusRaw as ToolStatus) : "planned";
  const defaultAccessRaw = String(formData.get("default_access") ?? "invite_only");
  const defaultAccess = DEFAULT_ACCESS_VALUES.includes(defaultAccessRaw as ToolDefaultAccess)
    ? (defaultAccessRaw as ToolDefaultAccess)
    : "invite_only";

  if (!name || !description || !route.startsWith("/")) {
    redirect(`/admin/tools/${toolId}/edit?error=${encodeURIComponent("Route must start with /.")}`);
  }

  const supabase = await createClient();
  await supabase
    .from("tools")
    .update({ name, description, route, status, default_access: defaultAccess })
    .eq("id", toolId);

  await logAuditEvent({
    actorId: admin.id,
    action: "tool.updated",
    targetType: "tool",
    targetId: toolId,
    metadata: { name, status, default_access: defaultAccess },
  });

  redirect("/admin/tools");
}
