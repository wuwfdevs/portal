import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VALIDATION_STATE_LABEL } from "@/lib/bookings/labels";
import type { BkValidationState } from "@/lib/database.types";

export function ValidationBadge({ state }: { state: BkValidationState }) {
  const variant = state === "pending" ? "warning" : state === "validated" ? "success" : "accent";
  return <Badge variant={variant}>{VALIDATION_STATE_LABEL[state]}</Badge>;
}

/**
 * The per-row validation controls Finance uses on an assumption or a pool:
 * Validated (one click), Accept as is (opens a note field via `?accept=<id>`,
 * since the note is required), and Reopen on a resolved row. The same
 * server action serves both, told apart by which page passes it.
 */
export function ValidationControls({
  action,
  id,
  versionId,
  state,
  note,
  acceptOpen,
  acceptHref,
  closeHref,
  extraFields,
}: {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  versionId: string;
  state: BkValidationState;
  note: string | null;
  acceptOpen: boolean;
  acceptHref: string;
  closeHref: string;
  /** Extra hidden fields every form carries (a package's review says which of its two things it is about). */
  extraFields?: Record<string, string>;
}) {
  const extras = Object.entries(extraFields ?? {}).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));
  if (acceptOpen) {
    return (
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="version_id" value={versionId} />
        {extras}
        <input type="hidden" name="state" value="accepted_as_is" />
        <Input name="note" placeholder="Why it is accepted as it stands" required autoFocus />
        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary">
            Accept as is
          </Button>
          <Link href={closeHref} className="text-sm font-bold text-brand-link hover:underline">
            Cancel
          </Link>
        </div>
      </form>
    );
  }

  if (state !== "pending") {
    return (
      <div className="flex flex-col gap-1">
        {note && <span className="text-xs text-ink-500">{note}</span>}
        <form action={action}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="version_id" value={versionId} />
          {extras}
          <input type="hidden" name="state" value="pending" />
          <Button type="submit" variant="ghost" className="text-xs">
            Reopen
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="version_id" value={versionId} />
        {extras}
        <input type="hidden" name="state" value="validated" />
        <Button type="submit" variant="secondary" className="px-3 py-1.5 text-xs">
          Validated
        </Button>
      </form>
      <Link href={acceptHref} className="px-1 text-xs font-bold text-brand-link hover:underline">
        Accept as is…
      </Link>
    </div>
  );
}
