"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdministrator } from "@/lib/auth/authz";
import { logAuditEvent } from "@/lib/audit";
import { getSiteUrl } from "@/lib/site-url";
import { isValidEmail } from "@/lib/validation";
import type { PlatformRole, AccountStatus } from "@/lib/database.types";
import { parseToolGrants, sameRoles } from "@/lib/tool-roles";
import { failIfError, failWith } from "@/lib/editorial/action-result";

const USERS_PATH = "/admin/users";
const INVITE_PATH = "/admin/users/invite";
const PLATFORM_ROLES: PlatformRole[] = ["administrator", "staff", "student", "faculty_partner"];

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
    failWith(INVITE_PATH, "Enter a name and a valid email address.");
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName, platform_role: platformRole, invited_by: admin.id },
    redirectTo: `${getSiteUrl()}/auth/callback`,
  });

  if (error || !data.user) {
    failWith(INVITE_PATH, error?.message ?? "Could not send invitation.");
  }

  const supabase = await createClient();
  const newUserId = data.user.id;

  if (toolGrants.length > 0) {
    const { error: grantError } = await supabase.from("tool_access").insert(
      toolGrants.map((grant) => ({
        user_id: newUserId,
        tool_id: grant.toolId,
        tool_roles: grant.toolRoles,
        granted_by: admin.id,
      })),
    );
    // The invitation is already sent; say so, so the administrator grants the tools from the
    // user's page rather than inviting a second time.
    failIfError(
      grantError,
      USERS_PATH,
      `The invitation to ${email} was sent, but their tool access could not be saved`,
    );
  }

  const { error: requestError } = await supabase
    .from("access_requests")
    .update({ status: "approved", reviewed_by: admin.id, reviewed_at: new Date().toISOString() })
    .eq("email", email)
    .eq("status", "pending");
  failIfError(
    requestError,
    USERS_PATH,
    `The invitation to ${email} was sent, but their access request could not be marked approved`,
  );

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

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("email, display_name, platform_role")
    .eq("id", userId)
    .maybeSingle();
  failIfError(profileError, USERS_PATH, "Could not load that user");
  if (!profile) failWith(USERS_PATH, "That user no longer exists.");

  const adminClient = createAdminClient();
  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(profile.email, {
    data: {
      display_name: profile.display_name,
      platform_role: profile.platform_role,
      invited_by: admin.id,
    },
    redirectTo: `${getSiteUrl()}/auth/callback`,
  });
  if (inviteError) failWith(USERS_PATH, `Could not resend the invitation: ${inviteError.message}`);

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

  if (!["active", "disabled"].includes(status)) redirect(USERS_PATH);

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ account_status: status })
    .eq("id", userId);
  failIfError(error, USERS_PATH, "Could not change the account status");

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

  const title =
    String(formData.get("title") ?? "")
      .trim()
      .slice(0, 120) || null;
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ platform_role: platformRole, title })
    .eq("id", userId);
  failIfError(profileError, USERS_PATH, "Could not save the user's role");

  const { data: existingGrants, error: grantsError } = await supabase
    .from("tool_access")
    .select("id, tool_id, tool_roles")
    .eq("user_id", userId)
    .is("revoked_at", null);
  failIfError(grantsError, USERS_PATH, "Could not load the user's current access");

  const existingByToolId = new Map((existingGrants ?? []).map((row) => [row.tool_id, row]));

  // Revoke grants that were unchecked.
  const toRevoke = (existingGrants ?? []).filter((row) => !grantedToolIds.has(row.tool_id));
  if (toRevoke.length > 0) {
    const { error: revokeError } = await supabase
      .from("tool_access")
      .update({ revoked_at: new Date().toISOString(), revoked_by: admin.id })
      .in(
        "id",
        toRevoke.map((row) => row.id),
      );
    failIfError(revokeError, USERS_PATH, "Could not remove the unchecked tool access");
  }

  // Insert newly checked grants; update the roles on ones that already existed.
  // tool_role follows tool_roles[1] through the table's trigger.
  for (const grant of toolGrants) {
    const existing = existingByToolId.get(grant.toolId);
    if (!existing) {
      const { error: insertError } = await supabase.from("tool_access").insert({
        user_id: userId,
        tool_id: grant.toolId,
        tool_roles: grant.toolRoles,
        granted_by: admin.id,
      });
      failIfError(insertError, USERS_PATH, "Could not grant tool access");
    } else if (!sameRoles(existing.tool_roles, grant.toolRoles)) {
      const { error: updateError } = await supabase
        .from("tool_access")
        .update({ tool_roles: grant.toolRoles })
        .eq("id", existing.id);
      failIfError(updateError, USERS_PATH, "Could not change tool roles");
    }
  }

  await logAuditEvent({
    actorId: admin.id,
    action: "user.access_updated",
    targetType: "profile",
    targetId: userId,
    metadata: {
      platform_role: platformRole,
      tool_ids: Array.from(grantedToolIds),
      tool_roles: Object.fromEntries(toolGrants.map((grant) => [grant.toolId, grant.toolRoles])),
    },
  });

  redirect("/admin/users");
}

export async function denyAccessRequest(formData: FormData): Promise<void> {
  const admin = await assertAdministrator();
  const requestId = String(formData.get("request_id") ?? "");
  const supabase = await createClient();

  const { error } = await supabase
    .from("access_requests")
    .update({ status: "denied", reviewed_by: admin.id, reviewed_at: new Date().toISOString() })
    .eq("id", requestId);
  failIfError(error, USERS_PATH, "Could not deny the access request");

  await logAuditEvent({
    actorId: admin.id,
    action: "access_request.denied",
    targetType: "access_request",
    targetId: requestId,
  });

  redirect("/admin/users");
}
