import { Alert } from "@/components/ui/alert";
import { SecondaryLink } from "@/components/ui/primary-link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Field, Input, Select } from "@/components/ui/input";
import { updateTool } from "../../actions";

export default async function EditToolPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: tool } = await supabase.from("tools").select("*").eq("id", id).maybeSingle();

  if (!tool) notFound();

  return (
    <div className="max-w-lg">
      <PageHeader
        className="mb-5"
        back={{ href: "/admin/tools", label: "Back to tools" }}
        title={tool.name}
      />
      <Card>
        <form action={updateTool} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="tool_id" value={tool.id} />
          {error && <Alert>{error}</Alert>}
          <Field label="Name" htmlFor="name">
            <Input id="name" name="name" defaultValue={tool.name} required />
          </Field>
          <Field label="Description" htmlFor="description">
            <Input id="description" name="description" defaultValue={tool.description} required />
          </Field>
          <Field label="Route" htmlFor="route">
            <Input id="route" name="route" defaultValue={tool.route} required />
          </Field>
          <Field
            label="Status"
            htmlFor="status"
            hint="Moving a proposed tool off Proposed is how an idea becomes a real registry entry. Roadmap posts already pointing at it keep pointing at it."
          >
            <Select id="status" name="status" defaultValue={tool.status}>
              <option value="proposed">Proposed (an idea, not on the dashboard)</option>
              <option value="planned">Planned</option>
              <option value="in_development">In development</option>
              <option value="available">Available</option>
            </Select>
          </Field>
          <Field label="Default access" htmlFor="default_access">
            <Select id="default_access" name="default_access" defaultValue={tool.default_access}>
              <option value="invite_only">Invite only</option>
              <option value="approved_staff">Open to approved staff</option>
              <option value="open">Open</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2.5 border-t border-line pt-4">
            <SecondaryLink href="/admin/tools">Cancel</SecondaryLink>
            <Button type="submit">Save changes</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
