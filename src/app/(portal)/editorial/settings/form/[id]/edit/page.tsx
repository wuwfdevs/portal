import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/editorial/data";
import { FIELD_TYPE_LABEL, PRIMARY_PILLAR_FIELD_KEY } from "@/lib/editorial/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
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
  const field = unwrapRead(
    await supabase.from("ep_form_fields").select("*").eq("id", id).maybeSingle(),
    "the field",
  );
  if (!field) notFound();

  const isPillarField = field.key === PRIMARY_PILLAR_FIELD_KEY;
  const hasOptions =
    !isPillarField && (field.field_type === "select" || field.field_type === "multi_select");

  return (
    <div className="max-w-lg">
      <div className="mb-4">
        <Link
          href="/editorial/settings/form"
          className="text-xs font-semibold text-brand-link hover:underline"
        >
          ← Back to submission form
        </Link>
      </div>
      <div className="rounded border border-line">
        <div className="border-b border-line px-5 py-4">
          <div className="font-serif text-[17px] font-bold text-ink-900">{field.label}</div>
          <p className="mt-1 text-xs text-ink-400">
            <code className="font-mono">{field.key}</code> ·{" "}
            {FIELD_TYPE_LABEL[field.field_type].toLowerCase()}
          </p>
        </div>
        <form action={updateFormField} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="field_id" value={field.id} />
          {error && <Alert>{error}</Alert>}

          <Alert variant="note">
            The key and type are fixed. To change what this field <em>means</em>, retire it and add
            a new one — editing it in place would silently rewrite what past pitches were answering.
          </Alert>

          <div>
            <Label htmlFor="label">Label</Label>
            <Input id="label" name="label" defaultValue={field.label} required maxLength={120} />
          </div>
          <div>
            <Label htmlFor="help_text">Help text</Label>
            <Input
              id="help_text"
              name="help_text"
              defaultValue={field.help_text ?? ""}
              maxLength={200}
            />
          </div>
          {hasOptions && (
            <div>
              <Label htmlFor="options">Options</Label>
              <Textarea
                id="options"
                name="options"
                rows={5}
                defaultValue={(field.options ?? []).join("\n")}
                required
              />
              <FieldHint>
                One option per line. Removing an option doesn&apos;t change pitches that already
                selected it.
              </FieldHint>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              name="required"
              defaultChecked={field.required}
              className="h-4 w-4"
            />
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
