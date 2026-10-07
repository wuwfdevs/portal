import { Alert } from "@/components/ui/alert";
import { SecondaryLink } from "@/components/ui/primary-link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Field, Input, Label, Select } from "@/components/ui/input";
import { inviteUser } from "../actions";
import { ToolGrantRow } from "../tool-grant-row";

export default async function InviteUserPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string; name?: string }>;
}) {
  const { error, email, name } = await searchParams;
  const supabase = await createClient();
  // Proposed tools are ideas on the Roadmap, not software — nothing to grant.
  const { data: tools } = await supabase
    .from("tools")
    .select("*")
    .neq("status", "proposed")
    .order("sort_order");

  return (
    <div className="max-w-lg">
      <PageHeader
        className="mb-5"
        back={{ href: "/admin/users", label: "Back to users" }}
        title="Invite user"
      />
      <Card>
        <form action={inviteUser} className="flex flex-col gap-4 p-5">
          {error && <Alert>{error}</Alert>}
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={email}
              placeholder="name@wuwf.org"
              required
            />
          </Field>
          <Field label="Display name" htmlFor="display_name">
            <Input
              id="display_name"
              name="display_name"
              defaultValue={name}
              placeholder="Jordan Mays"
              required
            />
          </Field>
          <Field label="Platform role" htmlFor="platform_role">
            <Select id="platform_role" name="platform_role" defaultValue="staff">
              <option value="staff">Staff</option>
              <option value="student">Student</option>
              <option value="faculty_partner">Faculty / partner</option>
              <option value="administrator">Administrator</option>
            </Select>
          </Field>
          <div>
            <Label>Authorized tools</Label>
            <div className="flex flex-col gap-2.5">
              {(tools ?? []).map((tool) => (
                <ToolGrantRow key={tool.id} tool={tool} hasAccess={false} roles={[]} />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2.5 border-t border-line pt-4">
            <SecondaryLink href="/admin/users">Cancel</SecondaryLink>
            <Button type="submit">Send invitation</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
