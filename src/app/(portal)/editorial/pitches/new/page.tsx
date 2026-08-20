import Link from "next/link";
import { requireEditorialAccess } from "@/lib/editorial/access";
import { listPitchFormFields } from "@/lib/editorial/data";
import { PitchForm } from "../pitch-form";
import type { EpFieldValue } from "@/lib/database.types";

/**
 * Optional prefill: another tool can hand a reporter off to this same form
 * — never write an ep_pitches row itself — by linking here with query params
 * keyed by ep_form_fields.key (plus `title`), read as this form's own
 * initialValues/initialTitle. See Editorial Inquiry's "Develop into pitch"
 * (docs/editorial-inquiry-design.md §8) for the first caller. Any key not
 * present, or not matching a currently active field, is simply ignored —
 * this form still renders exactly the fields Editorial Planning currently
 * defines, never fields a caller merely wished existed.
 */
export default async function NewPitchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireEditorialAccess();
  const fields = await listPitchFormFields();
  const params = await searchParams;

  const initialValues: Record<string, EpFieldValue> = {};
  for (const field of fields) {
    const value = params[field.key];
    if (typeof value === "string" && value.trim()) {
      initialValues[field.key] = value;
    }
  }
  const initialTitleParam = params.title;
  const initialTitle = typeof initialTitleParam === "string" ? initialTitleParam : "";

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
          <PitchForm
            fields={fields}
            cancelHref="/editorial"
            initialTitle={initialTitle}
            initialValues={initialValues}
          />
        </div>
      </div>
    </div>
  );
}
