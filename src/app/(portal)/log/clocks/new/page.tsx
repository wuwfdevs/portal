import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
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
      <Link href={backHref} className="text-xs font-semibold text-brand-link">
        ← Back to {program ? program.name : "programs"}
      </Link>
      <h2 className="mt-2 mb-5 font-serif text-xl font-bold text-ink-900">
        {program ? `New clock for ${program.name}` : "New clock template"}
      </h2>
      <form action={createClockTemplate} className="flex w-full max-w-2xl flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        {program && <input type="hidden" name="from_program" value={program.id} />}
        <div>
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            required
            maxLength={120}
            placeholder="Weekday Morning Drive"
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" rows={2} />
          <FieldHint>
            Add versions and slots once the template exists. To put a program on it, use the
            program&apos;s Schedule page.
          </FieldHint>
        </div>
        <div className="flex items-center gap-4 border-t border-line pt-5">
          <Button type="submit">Create clock</Button>
          <Link href={backHref} className="px-1 text-sm font-bold text-brand-link hover:underline">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
