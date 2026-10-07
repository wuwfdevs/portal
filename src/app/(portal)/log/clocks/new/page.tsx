import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { TextLink } from "@/components/ui/primary-link";
import { requireProgramDirector } from "@/lib/log/access";
import { getProgram } from "@/lib/log/queries";
import { createClockTemplate } from "../../clock-actions";

/**
 * Creating a clock template: a name and a description, producer-only, reached
 * from a program's page ("Create a clock for this program", `?from=<program>`)
 * since a clock is created for a program rather than on its own. Versions and
 * slots are added on the clock's page once it exists.
 */
export default async function NewClockTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; error?: string }>;
}) {
  const { from, error } = await searchParams;
  await requireProgramDirector();
  const program = from ? await getProgram(from) : null;
  const backHref = program ? `/log/programs/${program.id}` : "/log/programs";

  return (
    <div>
      <PageHeader
        as="h2"
        back={{ href: backHref, label: `Back to ${program ? program.name : "programs"}` }}
        title={program ? `New clock for ${program.name}` : "New clock template"}
        className="mb-5"
      />
      <form action={createClockTemplate} className="flex w-full max-w-2xl flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        {program && <input type="hidden" name="from_program" value={program.id} />}
        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            name="name"
            required
            maxLength={120}
            placeholder="Weekday Morning Drive"
            autoFocus
          />
        </Field>
        <Field
          label="Description"
          htmlFor="description"
          hint={
            <>
              Add versions and slots once the template exists. To put a program on it, use the
              program&apos;s Schedule page.
            </>
          }
        >
          <Textarea id="description" name="description" rows={2} />
        </Field>
        <div className="flex items-center gap-4 border-t border-line pt-5">
          <Button type="submit">Create clock</Button>
          <TextLink href={backHref} className="hover:underline">
            Cancel
          </TextLink>
        </div>
      </form>
    </div>
  );
}
