import { requireToolAccess } from "@/lib/auth/authz";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Field, Input, Textarea } from "@/components/ui/input";
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
      <div className="max-w-lg">
        <PageHeader
          className="mb-6"
          back={{ href: "/audience-listening", label: "Back to queries" }}
          title="New query"
          description="This starts as a draft. Nothing is public until you add questions and open it — and a draft's link doesn't work even if someone has it."
        />

        {error && <Alert className="mb-4">{error}</Alert>}

        <form action={createQuery} className="flex flex-col gap-4">
          <Field
            label="Internal title"
            htmlFor="internal_title"
            hint="What the newsroom calls it. Participants never see this."
          >
            <Input
              id="internal_title"
              name="internal_title"
              placeholder="Housing affordability listener callout"
              required
            />
          </Field>
          <Field
            label="Public title"
            htmlFor="public_title"
            hint="The heading a participant reads first."
          >
            <Input
              id="public_title"
              name="public_title"
              placeholder="Tell us how housing costs are affecting you"
              required
            />
          </Field>
          <Field
            label="Public introduction"
            htmlFor="public_intro"
            hint="Why you're asking and what you'll do with it. Editable later."
          >
            <Textarea
              id="public_intro"
              name="public_intro"
              rows={5}
              placeholder="WUWF is reporting on housing affordability across Northwest Florida. We want to hear how changing housing costs have affected you, your family or your community."
            />
          </Field>
          <Field label="Internal notes (optional)" htmlFor="internal_notes">
            <Textarea
              id="internal_notes"
              name="internal_notes"
              rows={3}
              placeholder="Which story this feeds, who's covering it, when you need responses by"
            />
          </Field>

          <Button type="submit">Create query</Button>
        </form>
      </div>
    </div>
  );
}
