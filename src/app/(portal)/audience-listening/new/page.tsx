import Link from "next/link";
import { requireToolAccess } from "@/lib/auth/authz";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import { createQuery } from "../actions";

export default async function NewQueryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireToolAccess("audience-listening");
  const { error } = await searchParams;

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="mb-5">
        <Link href="/audience-listening" className="text-xs font-semibold text-brand-link">
          ← Back to queries
        </Link>
      </div>
      <div className="max-w-lg">
        <h1 className="mb-1.5 font-serif text-[22px] font-bold text-ink-900">New query</h1>
        <p className="mb-6 text-sm leading-relaxed text-ink-500">
          This starts as a draft. Nothing is public until you add questions and open it — and a
          draft&apos;s link doesn&apos;t work even if someone has it.
        </p>

        {error && <Alert className="mb-4">{error}</Alert>}

        <form action={createQuery} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="internal_title">Internal title</Label>
            <Input
              id="internal_title"
              name="internal_title"
              placeholder="Housing affordability listener callout"
              required
            />
            <FieldHint>What the newsroom calls it. Participants never see this.</FieldHint>
          </div>
          <div>
            <Label htmlFor="public_title">Public title</Label>
            <Input
              id="public_title"
              name="public_title"
              placeholder="Tell us how housing costs are affecting you"
              required
            />
            <FieldHint>The heading a participant reads first.</FieldHint>
          </div>
          <div>
            <Label htmlFor="public_intro">Public introduction</Label>
            <Textarea
              id="public_intro"
              name="public_intro"
              rows={5}
              placeholder="WUWF is reporting on housing affordability across Northwest Florida. We want to hear how changing housing costs have affected you, your family or your community."
            />
            <FieldHint>
              Why you&apos;re asking and what you&apos;ll do with it. Editable later.
            </FieldHint>
          </div>
          <div>
            <Label htmlFor="internal_notes">Internal notes (optional)</Label>
            <Textarea
              id="internal_notes"
              name="internal_notes"
              rows={3}
              placeholder="Which story this feeds, who's covering it, when you need responses by"
            />
          </div>

          <Button type="submit">Create query</Button>
        </form>
      </div>
    </div>
  );
}
