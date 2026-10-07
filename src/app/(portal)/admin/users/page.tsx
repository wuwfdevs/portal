import { createClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PrimaryLink, TextLink } from "@/components/ui/primary-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { denyAccessRequest, resendInvite, setAccountStatus } from "./actions";
import { formatShortDate } from "@/lib/format";
import { ACCOUNT_STATUS } from "@/lib/admin-status";

const ROLE_LABEL: Record<string, string> = {
  administrator: "Administrator",
  staff: "Staff",
  student: "Student",
  faculty_partner: "Faculty / partner",
};

function formatDate(value: string | null): string {
  return value ? formatShortDate(value) : "—";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; invited?: string; resent?: string }>;
}) {
  const { status: statusFilter, q, invited, resent } = await searchParams;
  const supabase = await createClient();

  const [{ data: profiles }, { data: grants }, { data: tools }, { data: pendingRequests }] =
    await Promise.all([
      supabase.from("profiles").select("*").order("display_name"),
      supabase.from("tool_access").select("user_id, tool_id").is("revoked_at", null),
      supabase.from("tools").select("id, name").neq("status", "proposed"),
      supabase
        .from("access_requests")
        .select("*")
        .eq("status", "pending")
        .order("requested_at", { ascending: false }),
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
      (p) =>
        p.display_name.toLowerCase().includes(needle) || p.email.toLowerCase().includes(needle),
    );
  }

  return (
    <div>
      <ListToolbar
        className="mb-5"
        search={{
          placeholder: "Search by name or email",
          label: "Search users",
          defaultValue: q,
          hidden: statusFilter && statusFilter !== "all" ? { status: statusFilter } : undefined,
        }}
        chipsLabel="Account status"
        chips={["all", "active", "invited", "pending", "disabled"].map((value) => ({
          label: value === "all" ? "All" : value[0]!.toUpperCase() + value.slice(1),
          href: value === "all" ? "/admin/users" : `/admin/users?status=${value}`,
          active: (statusFilter ?? "all") === value,
        }))}
      >
        <PrimaryLink href="/admin/users/invite">+ Invite user</PrimaryLink>
      </ListToolbar>

      {(invited || resent) && (
        <Alert variant="success" className="mb-4">
          {invited ? `Invitation sent to ${invited}.` : `Invitation re-sent to ${resent}.`}
        </Alert>
      )}

      {pendingRequests && pendingRequests.length > 0 && (
        <Card className="mb-6 bg-transparent">
          <div className="border-b border-line bg-panel-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-ink-500">
            Pending access requests
          </div>
          {pendingRequests.map((request) => (
            <div
              key={request.id}
              className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0"
            >
              <div>
                <div className="text-sm font-semibold text-ink-900">{request.display_name}</div>
                <div className="text-xs text-ink-500">{request.email}</div>
                {request.note && <div className="mt-1 text-xs text-ink-400">{request.note}</div>}
              </div>
              <div className="flex items-center gap-3">
                <TextLink
                  href={`/admin/users/invite?email=${encodeURIComponent(request.email)}&name=${encodeURIComponent(request.display_name)}`}
                  className="px-0 text-xs font-semibold"
                >
                  Approve &amp; invite
                </TextLink>
                <form action={denyAccessRequest}>
                  <input type="hidden" name="request_id" value={request.id} />
                  <Button type="submit" variant="danger-link">
                    Deny
                  </Button>
                </form>
              </div>
            </div>
          ))}
        </Card>
      )}

      <TableFrame>
        <Table stack className="md:min-w-[860px]">
          <thead>
            <HeaderRow>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Status</Th>
              <Th>Role</Th>
              <Th>Tool access</Th>
              <Th>Last active</Th>
              <Th>Actions</Th>
            </HeaderRow>
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
              const tools = accessByUser.get(profile.id);
              return (
                <Row key={profile.id}>
                  <Cell stack="title" className="font-semibold text-ink-900">
                    {profile.display_name}
                  </Cell>
                  <Cell label="Email" className="text-ink-500">
                    {profile.email}
                  </Cell>
                  <Cell stack="aside">
                    <StatusBadge map={ACCOUNT_STATUS} value={profile.account_status} />
                  </Cell>
                  <Cell label="Role" className="text-ink-700">
                    {ROLE_LABEL[profile.platform_role]}
                  </Cell>
                  <Cell label="Tool access" className="text-ink-500">
                    {tools?.join(", ") ?? "—"}
                  </Cell>
                  <Cell label="Last active" className="text-ink-500">
                    {formatDate(profile.last_active_at)}
                  </Cell>
                  <Cell stack="full">
                    <div className="flex items-center gap-3 whitespace-nowrap">
                      <TextLink
                        href={`/admin/users/${profile.id}/edit`}
                        className="px-0 text-xs font-semibold"
                      >
                        Edit access
                      </TextLink>
                      {profile.account_status === "invited" && (
                        <form action={resendInvite}>
                          <input type="hidden" name="user_id" value={profile.id} />
                          <Button type="submit" variant="ghost" size="sm" className="px-0">
                            Resend invite
                          </Button>
                        </form>
                      )}
                      {profile.account_status === "disabled" ? (
                        <form action={setAccountStatus}>
                          <input type="hidden" name="user_id" value={profile.id} />
                          <input type="hidden" name="status" value="active" />
                          <Button type="submit" variant="ghost" size="sm" className="px-0">
                            Enable
                          </Button>
                        </form>
                      ) : (
                        <form action={setAccountStatus}>
                          <input type="hidden" name="user_id" value={profile.id} />
                          <input type="hidden" name="status" value="disabled" />
                          <Button type="submit" variant="danger-link">
                            Disable
                          </Button>
                        </form>
                      )}
                    </div>
                  </Cell>
                </Row>
              );
            })}
          </tbody>
        </Table>
      </TableFrame>
    </div>
  );
}
