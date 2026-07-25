import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/editorial/data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
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
  const criterion = unwrapRead(
    await supabase.from("ep_criteria").select("*").eq("id", id).maybeSingle(),
    "the criterion",
  );
  if (!criterion) notFound();

  return (
    <div className="max-w-lg">
      <div className="mb-4">
        <Link
          href="/editorial/settings/rubric"
          className="text-xs font-semibold text-brand-link hover:underline"
        >
          ← Back to rubric
        </Link>
      </div>
      <div className="rounded border border-line">
        <div className="border-b border-line px-5 py-4 font-serif text-[17px] font-bold text-ink-900">
          {criterion.name}
        </div>
        <form action={updateCriterion} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="criterion_id" value={criterion.id} />
          {error && <Alert>{error}</Alert>}

          <Alert variant="note">
            To change what this criterion <em>measures</em>, retire it and add a new one — past
            scores were given against the wording below.
          </Alert>

          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={criterion.name} required maxLength={80} />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              name="description"
              defaultValue={criterion.description}
              required
              maxLength={200}
            />
          </div>
          <div>
            <Label htmlFor="guidance">Guidance for reviewers</Label>
            <Textarea
              id="guidance"
              name="guidance"
              rows={3}
              defaultValue={criterion.guidance ?? ""}
            />
            <FieldHint>Shown inline while scoring.</FieldHint>
          </div>
          <div>
            <Label htmlFor="weight">Weight</Label>
            <Input
              id="weight"
              name="weight"
              type="number"
              step="0.1"
              min="0.1"
              max="10"
              defaultValue={criterion.weight}
              className="w-24"
            />
            <FieldHint>
              Weight changes apply to future scoring only; existing scores keep the weight they were
              given under.
            </FieldHint>
          </div>
          <div className="flex justify-end gap-2.5 border-t border-line pt-4">
            <Link href="/editorial/settings/rubric">
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
