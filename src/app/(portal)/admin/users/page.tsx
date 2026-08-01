import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { denyAccessRequest, resendInvite, setAccountStatus } from "./actions";
import type { AccountStatus } from "@/lib/database.types";

const STATUS_BADGE: Record<AccountStatus, { label: string; variant: "accent" | "neutral" | "muted" }> = {
  active: { label: "Active", variant: "accent" },
  invited: { label: "Invited", variant: "neutral" },
  pending: { label: "Pending", variant: "neutral" },
  disabled: { label: "Disabled", variant: "muted" },
};

const ROLE_LABEL: Record<string, string> = {
  administrator: "Administrator",
  staff: "Staff",
  student: "Student",
  faculty_partner: "Faculty / partner",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; invited?: string; resent?: string }>;
}) {
  const { status: statusFilter, q, invited, resent } = await searchParams;
  const supabase = await createClient();

  const [{ data: profiles }, { data: grants }, { data: tools }, { data: pendingRequests }] = await Promise.all([
    supabase.from("profiles").select("*").order("display_name"),
    supabase.from("tool_access").select("user_id, tool_id").is("revoked_at", null),
    supabase.from("tools").select("id, name"),
    supabase.from("access_requests").select("*").eq("status", "pending").order("requested_at", { ascending: false }),
  ]);

  const toolNameById = new Map((tools ?? []).map((tool) => [tool.id, tool.name]));
  const accessByUser = new Map<string, string[]>();
  for (const row of grants ?? []) {
    const toolName = toolNameById.get(row.tool_id);
    if (!toolName) continue;
    const list = accessByUser.get(row.user_id) ?? [];
    list.push(toolName);
    accessByUser.set(row.user_id, list);
  }

  let visibleProfiles = profiles ?? [];
  if (statusFilter && statusFilter !== "all") {
    visibleProfiles = visibleProfiles.filter((p) => p.account_status === statusFilter);
  }
  if (q) {
    const needle = q.toLowerCase();
    visibleProfiles = visibleProfiles.filter(
      (p) => p.display_name.toLowerCase().includes(needle) || p.email.toLowerCase().includes(needle),
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <form className="flex flex-1 items-center gap-2 rounded-full border border-line px-3.5 py-1.5 sm:flex-initial">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A9099" strokeWidth={2} className="shrink-0">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3-3" />
          </svg>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by name or email"
            className="w-full min-w-0 border-0 text-base text-ink-900 outline-none placeholder:text-ink-400 sm:w-64 sm:text-sm"
          />
        </form>
        <Link href="/admin/users/invite" className="shrink-0">
          <Button>+ Invite user</Button>
        </Link>
      </div>

      {(invited || resent) && (
        <div className="mb-4 flex items-center gap-2 rounded border border-success-border bg-success-bg px-4 py-2.5 text-sm text-ink-700">
          {invited ? `Invitation sent to ${invited}.` : `Invitation re-sent to ${resent}.`}
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-1.5">
        {["all", "active", "invited", "pending", "disabled"].map((value) => (
          <Link
            key={value}
            href={value === "all" ? "/admin/users" : `/admin/users?status=${value}`}
            className={
              (statusFilter ?? "all") === value
                ? "rounded-full bg-brand-surface px-3 py-1.5 text-xs font-bold text-brand-link"
                : "rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-500"
            }
          >
            {value === "all" ? "All" : value[0]!.toUpperCase() + value.slice(1)}
          </Link>
        ))}
      </div>

      {pendingRequests && pendingRequests.length > 0 && (
        <div className="mb-6 rounded border border-line">
          <div className="border-b border-line bg-panel-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-ink-500">
            Pending access requests
          </div>
          {pendingRequests.map((request) => (
            <div key={request.id} className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0">
              <div>
                <div className="text-sm font-semibold text-ink-900">{request.display_name}</div>
                <div className="text-xs text-ink-500">{request.email}</div>
                {request.note && <div className="mt-1 text-xs text-ink-400">{request.note}</div>}
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href={`/admin/users/invite?email=${encodeURIComponent(request.email)}&name=${encodeURIComponent(request.display_name)}`}
                  className="text-xs font-semibold text-brand-link"
                >
                  Approve &amp; invite
                </Link>
                <form action={denyAccessRequest}>
                  <input type="hidden" name="request_id" value={request.id} />
                  <button type="submit" className="text-xs font-semibold text-danger">
                    Deny
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded border border-line">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-line bg-panel-50 text-left text-[11px] font-bold uppercase tracking-wide text-ink-500">
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5">Tool access</th>
              <th className="px-4 py-2.5">Last active</th>
              <th className="px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleProfiles.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-400">
                  No users match this filter.
                </td>
              </tr>
            )}
            {visibleProfiles.map((profile) => {
              const badge = STATUS_BADGE[profile.account_status];
              const tools = accessByUser.get(profile.id);
              return (
                <tr key={profile.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-3 font-semibold text-ink-900">{profile.display_name}</td>
                  <td className="px-4 py-3 text-ink-500">{profile.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-700">{ROLE_LABEL[profile.platform_role]}</td>
                  <td className="px-4 py-3 text-ink-500">{tools?.join(", ") ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-500">{formatDate(profile.last_active_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 whitespace-nowrap text-xs font-semibold">
                      <Link href={`/admin/users/${profile.id}/edit`} className="text-brand-link">
                        Edit access
                      </Link>
                      {profile.account_status === "invited" && (
                        <form action={resendInvite}>
                          <input type="hidden" name="user_id" value={profile.id} />
                          <button type="submit" className="text-brand-link">
                            Resend invite
                          </button>
                        </form>
                      )}
                      {profile.account_status === "disabled" ? (
                        <form action={setAccountStatus}>
                          <input type="hidden" name="user_id" value={profile.id} />
                          <input type="hidden" name="status" value="active" />
                          <button type="submit" className="text-brand-link">
                            Enable
                          </button>
                        </form>
                      ) : (
                        <form action={setAccountStatus}>
                          <input type="hidden" name="user_id" value={profile.id} />
                          <input type="hidden" name="status" value="disabled" />
                          <button type="submit" className="text-danger">
                            Disable
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
