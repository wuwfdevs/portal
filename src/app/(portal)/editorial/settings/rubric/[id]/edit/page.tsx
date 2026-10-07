import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead, listRubricProfiles } from "@/lib/editorial/data";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldHint, Input, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SecondaryLink } from "@/components/ui/primary-link";
import { updateCriterion } from "../../../actions";

export default async function EditCriterionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const criterionResult = await supabase.from("ep_criteria").select("*").eq("id", id).maybeSingle();
  const criterion = unwrapRead(criterionResult, "the criterion");
  const profiles = await listRubricProfiles();
  if (!criterion) notFound();
  const profile = profiles.find((p) => p.id === criterion.profile_id);
  const anchorsText = criterion.anchors
    ? Object.entries(criterion.anchors)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([value, text]) => `${value}: ${text}`)
        .join("\n")
    : "";

  return (
    <div className="max-w-lg">
      <PageHeader
        className="mb-4"
        back={{ href: "/editorial/settings/rubric", label: "Back to rubric" }}
        title={criterion.name}
        badge={
          <>
            <Badge variant={criterion.criterion_type === "modifier" ? "danger" : "neutral"}>
              {criterion.criterion_type === "modifier" ? "Modifier" : "Core"}
            </Badge>
            {profile && <span className="text-xs text-ink-400">{profile.name}</span>}
          </>
        }
      />
      <Card>
        <form action={updateCriterion} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="criterion_id" value={criterion.id} />
          {error && <Alert>{error}</Alert>}

          <Alert variant="note">
            To change what this criterion <em>measures</em>, retire it and add a new one — past
            scores were given against the wording below. Type and rubric profile are fixed after
            creation.
          </Alert>

          <Field label="Name" htmlFor="name">
            <Input id="name" name="name" defaultValue={criterion.name} required maxLength={80} />
          </Field>
          <Field label="Description" htmlFor="description">
            <Input
              id="description"
              name="description"
              defaultValue={criterion.description}
              required
              maxLength={240}
            />
          </Field>
          <Field
            label="Guidance for reviewers"
            htmlFor="guidance"
            hint="Shown inline while scoring."
          >
            <Textarea
              id="guidance"
              name="guidance"
              rows={3}
              defaultValue={criterion.guidance ?? ""}
            />
          </Field>
          {criterion.criterion_type === "core" && (
            <Field
              label="Weight"
              htmlFor="weight"
              hint="Weight changes apply to future scoring only; existing scores keep the weight they were given under."
            >
              <Input
                id="weight"
                name="weight"
                type="number"
                step="0.1"
                min="0.1"
                max="100"
                defaultValue={criterion.weight}
                className="w-24"
              />
            </Field>
          )}
          <div className="flex gap-3">
            <Field label="Scale override — low" htmlFor="scale_min">
              <Input
                id="scale_min"
                name="scale_min"
                type="number"
                defaultValue={criterion.scale_min ?? ""}
                className="w-24"
              />
            </Field>
            <Field label="Scale override — high" htmlFor="scale_max">
              <Input
                id="scale_max"
                name="scale_max"
                type="number"
                defaultValue={criterion.scale_max ?? ""}
                className="w-24"
              />
            </Field>
          </div>
          <FieldHint>Leave both blank to use the tool-wide scale.</FieldHint>
          <Field
            label="Anchored scale descriptions"
            htmlFor="anchors"
            hint={'One per line, formatted as "score: description". Optional.'}
          >
            <Textarea id="anchors" name="anchors" rows={6} defaultValue={anchorsText} />
          </Field>
          <div className="flex justify-end gap-2.5 border-t border-line pt-4">
            <SecondaryLink href="/editorial/settings/rubric">Cancel</SecondaryLink>
            <Button type="submit">Save changes</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
