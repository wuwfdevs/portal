import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { getRoleCatalog } from "@/lib/tool-roles";
import { inviteUser } from "../actions";

export default async function InviteUserPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string; name?: string }>;
}) {
  const { error, email, name } = await searchParams;
  const supabase = await createClient();
  const { data: tools } = await supabase.from("tools").select("*").order("sort_order");

  return (
    <div className="max-w-lg">
      <div className="mb-5">
        <Link href="/admin/users" className="text-xs font-semibold text-brand-link">
          ← Back to users
        </Link>
      </div>
      <div className="rounded border border-line">
        <div className="border-b border-line px-5 py-4 font-serif text-[17px] font-bold text-ink-900">
          Invite user
        </div>
        <form action={inviteUser} className="flex flex-col gap-4 p-5">
          {error && <p className="text-xs text-danger">{error}</p>}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={email} placeholder="name@wuwf.org" required />
          </div>
          <div>
            <Label htmlFor="display_name">Display name</Label>
            <Input id="display_name" name="display_name" defaultValue={name} placeholder="Jordan Mays" required />
          </div>
          <div>
            <Label htmlFor="platform_role">Platform role</Label>
            <Select id="platform_role" name="platform_role" defaultValue="staff">
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
                const roleOptions = getRoleCatalog(tool.key);
                return (
                  <label key={tool.id} className="flex items-center justify-between gap-2.5 text-sm text-ink-900">
                    <span className="flex items-center gap-2">
                      <input type="checkbox" name="tool_id" value={tool.id} className="accent-brand-primary" />
                      {tool.name}
                    </span>
                    {roleOptions && (
                      <select
                        name={`tool_role_${tool.id}`}
                        defaultValue=""
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
            <Button type="submit">Send invitation</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
