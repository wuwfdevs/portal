import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { requireLogProducer } from "@/lib/log/access";
import { getClockTemplateDetail, listPrograms } from "@/lib/log/queries";
import { chooseProgramForClock } from "../../../program-actions";

/**
 * "Schedule a program with this clock": pick the program, then land on that
 * program's ordinary schedule form with this clock preselected. Nothing is
 * written here — scheduling stays one form, on the program's page.
 */
export default async function ScheduleProgramWithClockPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  await requireLogProducer();
  const [template, programs] = await Promise.all([getClockTemplateDetail(id), listPrograms()]);
  if (!template) notFound();

  return (
    <div>
      <Link href={`/log/clocks/${template.id}`} className="text-xs font-semibold text-brand-link">
        ← Back to {template.name}
      </Link>
      <h2 className="mt-2 mb-5 font-serif text-xl font-bold text-ink-900">
        Schedule a program with {template.name}
      </h2>
      <form action={chooseProgramForClock} className="flex w-full max-w-xl flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        <input type="hidden" name="clock_template_id" value={template.id} />
        <div>
          <Label htmlFor="program">Program</Label>
          <SearchableSelect
            id="program"
            name="program_id"
            required
            placeholder="Type a program name…"
            options={programs.map((program) => ({ id: program.id, label: program.name }))}
          />
        </div>
        <div className="flex items-center gap-4 border-t border-line pt-5">
          <Button type="submit">Continue</Button>
          <Link
            href={`/log/clocks/${template.id}`}
            className="px-1 text-sm font-bold text-brand-link hover:underline"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
