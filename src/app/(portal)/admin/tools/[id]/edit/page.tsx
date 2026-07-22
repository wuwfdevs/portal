import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
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
      <div className="mb-5">
        <Link href="/admin/tools" className="text-xs font-semibold text-brand-link">
          ← Back to tools
        </Link>
      </div>
      <div className="rounded border border-line">
        <div className="border-b border-line px-5 py-4 font-serif text-[17px] font-bold text-ink-900">
          {tool.name}
        </div>
        <form action={updateTool} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="tool_id" value={tool.id} />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={tool.name} required />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" defaultValue={tool.description} required />
          </div>
          <div>
            <Label htmlFor="route">Route</Label>
            <Input id="route" name="route" defaultValue={tool.route} required />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              name="status"
              defaultValue={tool.status}
              className="w-full rounded border border-line px-3 py-2.5 text-sm text-ink-900"
            >
              <option value="planned">Planned</option>
              <option value="in_development">In development</option>
              <option value="available">Available</option>
            </select>
          </div>
          <div>
            <Label htmlFor="default_access">Default access</Label>
            <select
              id="default_access"
              name="default_access"
              defaultValue={tool.default_access}
              className="w-full rounded border border-line px-3 py-2.5 text-sm text-ink-900"
            >
              <option value="invite_only">Invite only</option>
              <option value="approved_staff">Open to approved staff</option>
              <option value="open">Open</option>
            </select>
          </div>
          <div className="flex justify-end gap-2.5 border-t border-line pt-4">
            <Link href="/admin/tools">
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
