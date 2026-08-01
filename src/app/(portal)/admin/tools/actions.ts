"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertAdministrator } from "@/lib/auth/authz";
import { logAuditEvent } from "@/lib/audit";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import type { ToolStatus, ToolDefaultAccess } from "@/lib/database.types";

const TOOL_STATUSES: ToolStatus[] = ["available", "in_development", "planned", "proposed"];
const NEW_TOOL_PATH = "/admin/tools/new";
const TOOL_KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
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
  const status = TOOL_STATUSES.includes(statusRaw as ToolStatus)
    ? (statusRaw as ToolStatus)
    : "planned";
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

/**
 * Creates a `proposed` registry row — a tool that exists only as an idea, so a
 * Roadmap post has something to point at (docs/roadmap-design.md §6). This is
 * the only way to create a tools row outside a migration, and it deliberately
 * cannot create a real one: status, enabled, route, and default_access are
 * fixed here, and an administrator promotes the row from the edit screen once
 * the tool is actually being built.
 *
 * Unlike the two actions above, this one routes its failures through
 * failIfError/failWith — they predate that rule (see CLAUDE.md).
 */
export async function createProposedTool(formData: FormData): Promise<void> {
  const admin = await assertAdministrator();
  const key = String(formData.get("key") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const sortOrderRaw = String(formData.get("sort_order") ?? "").trim();

  if (!name) failWith(NEW_TOOL_PATH, "Give the proposed tool a name.");
  if (!description) failWith(NEW_TOOL_PATH, "Describe what the proposed tool would do.");
  if (!TOOL_KEY_PATTERN.test(key)) {
    failWith(
      NEW_TOOL_PATH,
      "The key must be lowercase letters, numbers, and hyphens — for example newsletter-builder.",
    );
  }

  const sortOrder = Number.parseInt(sortOrderRaw, 10);

  const supabase = await createClient();
  const { data: existing, error: lookupError } = await supabase
    .from("tools")
    .select("id")
    .eq("key", key)
    .maybeSingle();
  failIfError(lookupError, NEW_TOOL_PATH, "Could not check whether that key is taken");
  if (existing) failWith(NEW_TOOL_PATH, `A tool with the key "${key}" already exists.`);

  const { data, error } = await supabase
    .from("tools")
    .insert({
      key,
      name,
      description,
      route: `/tools/${key}`,
      status: "proposed",
      enabled: false,
      default_access: "invite_only",
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    })
    .select("id")
    .single();
  failIfError(error, NEW_TOOL_PATH, "Could not create the proposed tool");
  if (!data) failWith(NEW_TOOL_PATH, "Could not create the proposed tool — no row was created.");

  await logAuditEvent({
    actorId: admin.id,
    action: "tool.created",
    targetType: "tool",
    targetId: data.id,
    metadata: { key, name, status: "proposed" },
  });

  redirect("/admin/tools");
}
