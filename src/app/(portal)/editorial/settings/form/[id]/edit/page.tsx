import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/editorial/data";
import { FIELD_TYPE_LABEL, PRIMARY_PILLAR_FIELD_KEY } from "@/lib/editorial/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckboxField, Field, Input, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SecondaryLink } from "@/components/ui/primary-link";
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
      <PageHeader
        className="mb-4"
        back={{ href: "/editorial/settings/form", label: "Back to submission form" }}
        title={field.label}
        description={
          <>
            <code className="font-mono">{field.key}</code> ·{" "}
            {FIELD_TYPE_LABEL[field.field_type].toLowerCase()}
          </>
        }
      />
      <Card>
        <form action={updateFormField} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="field_id" value={field.id} />
          {error && <Alert>{error}</Alert>}

          <Alert variant="note">
            The key and type are fixed. To change what this field <em>means</em>, retire it and add
            a new one — editing it in place would silently rewrite what past pitches were answering.
          </Alert>

          <Field label="Label" htmlFor="label">
            <Input id="label" name="label" defaultValue={field.label} required maxLength={120} />
          </Field>
          <Field label="Help text" htmlFor="help_text">
            <Input
              id="help_text"
              name="help_text"
              defaultValue={field.help_text ?? ""}
              maxLength={200}
            />
          </Field>
          {hasOptions && (
            <Field
              label="Options"
              htmlFor="options"
              hint="One option per line. Removing an option doesn't change pitches that already selected it."
            >
              <Textarea
                id="options"
                name="options"
                rows={5}
                defaultValue={(field.options ?? []).join("\n")}
                required
              />
            </Field>
          )}
          <CheckboxField name="required" defaultChecked={field.required} label="Required" />
          <div className="flex justify-end gap-2.5 border-t border-line pt-4">
            <SecondaryLink href="/editorial/settings/form">Cancel</SecondaryLink>
            <Button type="submit">Save changes</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
