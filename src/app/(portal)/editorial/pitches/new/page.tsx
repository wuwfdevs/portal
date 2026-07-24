import Link from "next/link";
import { requireEditorialAccess } from "@/lib/editorial/access";
import { listFormFields } from "@/lib/editorial/data";
import { PitchForm } from "../pitch-form";

export default async function NewPitchPage() {
  await requireEditorialAccess();
  const fields = await listFormFields({ activeOnly: true });

  return (
    <div className="max-w-lg">
      <div className="mb-4">
        <Link href="/editorial" className="text-xs font-semibold text-brand-link hover:underline">
          ← Back to backlog
        </Link>
      </div>
      <div className="rounded border border-line">
        <div className="border-b border-line px-5 py-4">
          <div className="font-serif text-[17px] font-bold text-ink-900">New pitch</div>
          <p className="mt-1 text-xs leading-relaxed text-ink-400">
            It lands in the backlog, where an editor can pick it for a planning meeting. You can
            keep editing it until it goes on a slate.
          </p>
        </div>
        <div className="p-5">
          <PitchForm fields={fields} cancelHref="/editorial" />
        </div>
      </div>
    </div>
  );
}
