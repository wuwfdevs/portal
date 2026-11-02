import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Field, Input, Select } from "@/components/ui/input";
import { updateUserAccess } from "../../actions";
import { ToolGrantList } from "../../tool-grant-list";
import { FormActions } from "@/components/ui/form-actions";

export default async function EditUserAccessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: profile }, { data: tools }, { data: grants }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    // Proposed tools are ideas on the Roadmap, not software — nothing to grant.
    supabase.from("tools").select("*").neq("status", "proposed").order("sort_order"),
    supabase
      .from("tool_access")
      .select("tool_id, tool_roles")
      .eq("user_id", id)
      .is("revoked_at", null),
  ]);

  if (!profile) notFound();

  const grantByToolId = new Map((grants ?? []).map((g) => [g.tool_id, g.tool_roles]));

  return (
    <div className="max-w-3xl">
      <PageHeader
        className="mb-5"
        back={{ href: "/admin/users", label: "Back to users" }}
        title={profile.display_name}
        description={profile.email}
      />
      <Card>
        <form action={updateUserAccess} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="user_id" value={profile.id} />
          <Field label="Platform role" htmlFor="platform_role">
            <Select id="platform_role" name="platform_role" defaultValue={profile.platform_role}>
              <option value="staff">Staff</option>
              <option value="student">Student</option>
              <option value="faculty_partner">Faculty / partner</option>
              <option value="administrator">Administrator</option>
            </Select>
          </Field>
          <Field
            label="Title"
            htmlFor="title"
            hint="Prints on the signature line of an affidavit this person signs."
          >
            <Input id="title" name="title" maxLength={120} defaultValue={profile.title ?? ""} />
          </Field>
          <ToolGrantList tools={tools ?? []} rolesByToolId={grantByToolId} />
          <FormActions cancelHref={"/admin/users"} className="border-t border-line pt-4">
            <Button type="submit">Save changes</Button>
          </FormActions>
        </form>
      </Card>
    </div>
  );
}
