"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdministrator } from "@/lib/auth/authz";
import { logAuditEvent } from "@/lib/audit";
import { getSiteUrl } from "@/lib/site-url";
import { isValidEmail } from "@/lib/validation";
import type { PlatformRole, AccountStatus } from "@/lib/database.types";

const PLATFORM_ROLES: PlatformRole[] = ["administrator", "staff", "student", "faculty_partner"];

function parseToolGrants(formData: FormData): { toolId: string; toolRole: string | null }[] {
  return formData
    .getAll("tool_id")
    .map((value) => String(value))
    .filter(Boolean)
    .map((toolId) => ({
      toolId,
      toolRole: (formData.get(`tool_role_${toolId}`) as string | null)?.trim() || null,
    }));
}

export async function inviteUser(formData: FormData): Promise<void> {
  const admin = await assertAdministrator();

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const platformRoleRaw = String(formData.get("platform_role") ?? "staff");
  const platformRole = PLATFORM_ROLES.includes(platformRoleRaw as PlatformRole)
    ? (platformRoleRaw as PlatformRole)
    : "staff";
  const toolGrants = parseToolGrants(formData);

  if (!isValidEmail(email) || !displayName) {
    redirect("/admin/users/invite?error=" + encodeURIComponent("Enter a name and a valid email address."));
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName, platform_role: platformRole, invited_by: admin.id },
    redirectTo: `${getSiteUrl()}/auth/callback`,
  });

  if (error || !data.user) {
    redirect("/admin/users/invite?error=" + encodeURIComponent(error?.message ?? "Could not send invitation."));
  }

  const supabase = await createClient();
  const newUserId = data.user.id;

  if (toolGrants.length > 0) {
    await supabase.from("tool_access").insert(
      toolGrants.map((grant) => ({
        user_id: newUserId,
        tool_id: grant.toolId,
        tool_role: grant.toolRole,
        granted_by: admin.id,
      })),
    );
  }

  await supabase
    .from("access_requests")
    .update({ status: "approved", reviewed_by: admin.id, reviewed_at: new Date().toISOString() })
    .eq("email", email)
    .eq("status", "pending");

  await logAuditEvent({
    actorId: admin.id,
    action: "user.invited",
    targetType: "profile",
    targetId: newUserId,
    metadata: { email, display_name: displayName, platform_role: platformRole },
  });

  redirect("/admin/users?invited=" + encodeURIComponent(email));
}

export async function resendInvite(formData: FormData): Promise<void> {
  const admin = await assertAdministrator();
  const userId = String(formData.get("user_id") ?? "");
  const supabase = await createClient();

  const { data: profile } = await supabase.from("profiles").select("email, display_name, platform_role").eq("id", userId).single();
  if (!profile) redirect("/admin/users");

  const adminClient = createAdminClient();
  await adminClient.auth.admin.inviteUserByEmail(profile.email, {
    data: { display_name: profile.display_name, platform_role: profile.platform_role, invited_by: admin.id },
    redirectTo: `${getSiteUrl()}/auth/callback`,
  });

  await logAuditEvent({
    actorId: admin.id,
    action: "user.invite_resent",
    targetType: "profile",
    targetId: userId,
    metadata: { email: profile.email },
  });

  redirect("/admin/users?resent=" + encodeURIComponent(profile.email));
}

export async function setAccountStatus(formData: FormData): Promise<void> {
  const admin = await assertAdministrator();
  const userId = String(formData.get("user_id") ?? "");
  const status = String(formData.get("status") ?? "") as AccountStatus;

  if (!["active", "disabled"].includes(status)) redirect("/admin/users");

  const supabase = await createClient();
  await supabase.from("profiles").update({ account_status: status }).eq("id", userId);

  await logAuditEvent({
    actorId: admin.id,
    action: status === "disabled" ? "user.disabled" : "user.enabled",
    targetType: "profile",
    targetId: userId,
  });

  redirect("/admin/users");
}

export async function updateUserAccess(formData: FormData): Promise<void> {
  const admin = await assertAdministrator();
  const userId = String(formData.get("user_id") ?? "");
  const platformRoleRaw = String(formData.get("platform_role") ?? "staff");
  const platformRole = PLATFORM_ROLES.includes(platformRoleRaw as PlatformRole)
    ? (platformRoleRaw as PlatformRole)
    : "staff";
  const toolGrants = parseToolGrants(formData);
  const grantedToolIds = new Set(toolGrants.map((g) => g.toolId));

  const supabase = await createClient();

  await supabase.from("profiles").update({ platform_role: platformRole }).eq("id", userId);

  const { data: existingGrants } = await supabase
    .from("tool_access")
    .select("id, tool_id, tool_role")
    .eq("user_id", userId)
    .is("revoked_at", null);

  const existingByToolId = new Map((existingGrants ?? []).map((row) => [row.tool_id, row]));

  // Revoke grants that were unchecked.
  const toRevoke = (existingGrants ?? []).filter((row) => !grantedToolIds.has(row.tool_id));
  if (toRevoke.length > 0) {
    await supabase
      .from("tool_access")
      .update({ revoked_at: new Date().toISOString(), revoked_by: admin.id })
      .in(
        "id",
        toRevoke.map((row) => row.id),
      );
  }

  // Insert newly checked grants; update tool_role on ones that already existed.
  for (const grant of toolGrants) {
    const existing = existingByToolId.get(grant.toolId);
    if (!existing) {
      await supabase
        .from("tool_access")
        .insert({ user_id: userId, tool_id: grant.toolId, tool_role: grant.toolRole, granted_by: admin.id });
    } else if (existing.tool_role !== grant.toolRole) {
      await supabase.from("tool_access").update({ tool_role: grant.toolRole }).eq("id", existing.id);
    }
  }

  await logAuditEvent({
    actorId: admin.id,
    action: "user.access_updated",
    targetType: "profile",
    targetId: userId,
    metadata: { platform_role: platformRole, tool_ids: Array.from(grantedToolIds) },
  });

  redirect("/admin/users");
}

export async function denyAccessRequest(formData: FormData): Promise<void> {
  const admin = await assertAdministrator();
  const requestId = String(formData.get("request_id") ?? "");
  const supabase = await createClient();

  await supabase
    .from("access_requests")
    .update({ status: "denied", reviewed_by: admin.id, reviewed_at: new Date().toISOString() })
    .eq("id", requestId);

  await logAuditEvent({
    actorId: admin.id,
    action: "access_request.denied",
    targetType: "access_request",
    targetId: requestId,
  });

  redirect("/admin/users");
}
