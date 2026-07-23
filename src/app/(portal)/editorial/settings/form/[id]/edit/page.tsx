import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldHint } from "@/components/ui/input";
import { updateFormField } from "../../../actions";

export default async function EditFormFieldPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: field } = await supabase
    .from("ep_form_fields")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!field) notFound();

  const hasOptions = field.field_type === "select" || field.field_type === "multi_select";

  return (
    <div className="max-w-lg">
      <div className="mb-5">
        <Link href="/editorial/settings/form" className="text-xs font-semibold text-brand-link">
          ← Back to submission form
        </Link>
      </div>
      <div className="rounded border border-line">
        <div className="border-b border-line px-5 py-4">
          <div className="font-serif text-[17px] font-bold text-ink-900">{field.label}</div>
          <p className="mt-0.5 text-xs text-ink-400">
            Key <code>{field.key}</code> · type {field.field_type} (fixed — create a new field to
            change what it means)
          </p>
        </div>
        <form action={updateFormField} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="field_id" value={field.id} />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div>
            <Label htmlFor="label">Label</Label>
            <Input id="label" name="label" defaultValue={field.label} required />
          </div>
          <div>
            <Label htmlFor="help_text">Help text</Label>
            <Input id="help_text" name="help_text" defaultValue={field.help_text ?? ""} />
          </div>
          {hasOptions && (
            <div>
              <Label htmlFor="options">Options</Label>
              <textarea
                id="options"
                name="options"
                rows={4}
                defaultValue={(field.options ?? []).join("\n")}
                className="w-full rounded border border-line px-3 py-2 text-sm text-ink-900"
              />
              <FieldHint>
                One option per line. Removing an option doesn&apos;t change pitches that already
                selected it.
              </FieldHint>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" name="required" defaultChecked={field.required} />
            Required
          </label>
          <div className="flex justify-end gap-2.5 border-t border-line pt-4">
            <Link href="/editorial/settings/form">
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
