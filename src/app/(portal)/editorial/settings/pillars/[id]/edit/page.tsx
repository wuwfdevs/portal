import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/editorial/data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SecondaryLink } from "@/components/ui/primary-link";
import { updatePillar } from "../../../actions";

export default async function EditPillarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const pillar = unwrapRead(
    await supabase.from("ep_pillars").select("*").eq("id", id).maybeSingle(),
    "the pillar",
  );
  if (!pillar) notFound();

  return (
    <div className="max-w-lg">
      <PageHeader
        className="mb-4"
        back={{ href: "/editorial/settings/pillars", label: "Back to pillars" }}
        title={pillar.name}
      />
      <Card>
        <form action={updatePillar} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="pillar_id" value={pillar.id} />
          {error && <Alert>{error}</Alert>}

          <Alert variant="note">
            To change what this pillar <em>means</em>, retire it and add a new one — pitches that
            already picked it recorded the name below.
          </Alert>

          <Field label="Name" htmlFor="name">
            <Input id="name" name="name" defaultValue={pillar.name} required maxLength={120} />
          </Field>
          <Field
            label="Guiding question"
            htmlFor="guiding_question"
            hint="Shown to writers on the pitch form."
          >
            <Textarea
              id="guiding_question"
              name="guiding_question"
              rows={3}
              defaultValue={pillar.guiding_question ?? ""}
            />
          </Field>
          <div className="flex justify-end gap-2.5 border-t border-line pt-4">
            <SecondaryLink href="/editorial/settings/pillars">Cancel</SecondaryLink>
            <Button type="submit">Save changes</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
