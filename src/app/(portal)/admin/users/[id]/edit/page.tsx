import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { getRoleCatalog } from "@/lib/tool-roles";
import { updateUserAccess } from "../../actions";

export default async function EditUserAccessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: profile }, { data: tools }, { data: grants }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    supabase.from("tools").select("*").order("sort_order"),
    supabase.from("tool_access").select("tool_id, tool_role").eq("user_id", id).is("revoked_at", null),
  ]);

  if (!profile) notFound();

  const grantByToolId = new Map((grants ?? []).map((g) => [g.tool_id, g.tool_role]));

  return (
    <div className="max-w-lg">
      <div className="mb-5">
        <Link href="/admin/users" className="text-xs font-semibold text-brand-link">
          ← Back to users
        </Link>
      </div>
      <div className="rounded border border-line">
        <div className="border-b border-line px-5 py-4">
          <div className="font-serif text-[17px] font-bold text-ink-900">{profile.display_name}</div>
          <div className="text-xs text-ink-500">{profile.email}</div>
        </div>
        <form action={updateUserAccess} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="user_id" value={profile.id} />
          <div>
            <Label htmlFor="platform_role">Platform role</Label>
            <Select id="platform_role" name="platform_role" defaultValue={profile.platform_role}>
              <option value="staff">Staff</option>
              <option value="student">Student</option>
              <option value="faculty_partner">Faculty / partner</option>
              <option value="administrator">Administrator</option>
            </Select>
          </div>
          <div>
            <Label>Authorized tools</Label>
            <div className="flex flex-col gap-2.5">
              {(tools ?? []).map((tool) => {
                const currentRole = grantByToolId.get(tool.id);
                const hasAccess = grantByToolId.has(tool.id);
                const roleOptions = getRoleCatalog(tool.key);
                return (
                  <label key={tool.id} className="flex items-center justify-between gap-2.5 text-sm text-ink-900">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="tool_id"
                        value={tool.id}
                        defaultChecked={hasAccess}
                        className="accent-brand-primary"
                      />
                      {tool.name}
                    </span>
                    {roleOptions && (
                      <select
                        name={`tool_role_${tool.id}`}
                        defaultValue={currentRole ?? ""}
                        className="w-56 rounded border border-line px-2 py-1 text-xs text-ink-900"
                      >
                        <option value="">No specific role (defaults to {roleOptions[0]!.label})</option>
                        {roleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label} — {option.description}
                          </option>
                        ))}
                      </select>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2.5 border-t border-line pt-4">
            <Link href="/admin/users">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
            <Button type="submit">Save changes</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
