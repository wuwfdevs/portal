import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { requireLogProducer } from "@/lib/log/access";
import { getProgram } from "@/lib/log/queries";
import { updateProgram } from "../../../program-actions";

/**
 * Editing a program's name, kind and description, producer-only. The NPR
 * collection and feed-start hour are set by migration and shown read-only on
 * the program's page; they are not editable here.
 */
export default async function EditProgramPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  await requireLogProducer();
  const program = await getProgram(id);
  if (!program) notFound();
  const programPath = `/log/programs/${program.id}`;

  return (
    <div>
      <Link href={programPath} className="text-xs font-semibold text-brand-link">
        ← Back to {program.name}
      </Link>
      <h2 className="mt-2 mb-5 font-serif text-xl font-bold text-ink-900">Edit {program.name}</h2>
      <form action={updateProgram} className="flex w-full max-w-2xl flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        <input type="hidden" name="id" value={program.id} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={120}
              defaultValue={program.name}
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="kind">Kind</Label>
            <Select id="kind" name="kind" defaultValue={program.kind}>
              <option value="recurring">Recurring</option>
              <option value="special">Special</option>
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={program.description ?? undefined}
          />
          <FieldHint>The NPR collection id and feed start hour are set by migration.</FieldHint>
        </div>
        <div className="flex items-center gap-4 border-t border-line pt-5">
          <Button type="submit">Save changes</Button>
          <Link
            href={programPath}
            className="px-1 text-sm font-bold text-brand-link hover:underline"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
