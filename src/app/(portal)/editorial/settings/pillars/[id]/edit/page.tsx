import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/editorial/data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
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
      <div className="mb-4">
        <Link
          href="/editorial/settings/pillars"
          className="text-xs font-semibold text-brand-link hover:underline"
        >
          ← Back to pillars
        </Link>
      </div>
      <div className="rounded border border-line">
        <div className="border-b border-line px-5 py-4 font-serif text-[17px] font-bold text-ink-900">
          {pillar.name}
        </div>
        <form action={updatePillar} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="pillar_id" value={pillar.id} />
          {error && <Alert>{error}</Alert>}

          <Alert variant="note">
            To change what this pillar <em>means</em>, retire it and add a new one — pitches that
            already picked it recorded the name below.
          </Alert>

          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={pillar.name} required maxLength={120} />
          </div>
          <div>
            <Label htmlFor="guiding_question">Guiding question</Label>
            <Textarea
              id="guiding_question"
              name="guiding_question"
              rows={3}
              defaultValue={pillar.guiding_question ?? ""}
            />
            <FieldHint>Shown to writers on the pitch form.</FieldHint>
          </div>
          <div className="flex justify-end gap-2.5 border-t border-line pt-4">
            <Link href="/editorial/settings/pillars">
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
