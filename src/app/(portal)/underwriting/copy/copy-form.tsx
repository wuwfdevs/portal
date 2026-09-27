import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import type { UwCopyRow } from "@/lib/underwriting/queries";

export type CopyFormDefaults = Pick<
  UwCopyRow,
  | "label"
  | "execution_kind"
  | "script"
  | "duration_seconds"
  | "cart_identifier"
  | "effective_from"
  | "effective_to"
>;

/**
 * The one copy form, shared by /copy/new and /copy/[id]/edit
 * (docs/ui-patterns.md rule 3). The contract setup wizard's copy step keeps
 * its own shorter form, since it links the copy to the contract in the same
 * submit; this one is the library's standalone create/edit.
 */
export function CopyForm({
  action,
  defaults,
  submitLabel,
  cancelHref,
  error,
  hiddenFields,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaults?: CopyFormDefaults;
  submitLabel: string;
  cancelHref: string;
  error?: string;
  hiddenFields?: Record<string, string>;
}) {
  return (
    <form action={action} className="flex w-full max-w-2xl flex-col gap-5">
      {error && <Alert>{error}</Alert>}
      {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="label">Label</Label>
          <Input
            id="label"
            name="label"
            required
            maxLength={80}
            placeholder="Message A"
            defaultValue={defaults?.label ?? ""}
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="execution_kind">Execution</Label>
          <Select
            id="execution_kind"
            name="execution_kind"
            defaultValue={defaults?.execution_kind ?? "live_read"}
          >
            <option value="live_read">Live read</option>
            <option value="recorded">Recorded (via DAD)</option>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="script">Script</Label>
        <Textarea id="script" name="script" rows={5} defaultValue={defaults?.script ?? ""} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="duration_seconds">Duration (s)</Label>
          <Input
            id="duration_seconds"
            name="duration_seconds"
            type="number"
            min={1}
            defaultValue={defaults?.duration_seconds ?? ""}
          />
          <FieldHint>
            Left blank, a live read is planned at its estimated read time from the script.
          </FieldHint>
        </div>
        <div>
          <Label htmlFor="cart_identifier">DAD cart #</Label>
          <Input
            id="cart_identifier"
            name="cart_identifier"
            maxLength={120}
            defaultValue={defaults?.cart_identifier ?? ""}
          />
          <FieldHint>
            Only meaningful when execution is recorded — ENCO/DAD plays the audio, not the portal.
          </FieldHint>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="effective_from">Effective from</Label>
          <Input
            id="effective_from"
            name="effective_from"
            type="date"
            required={defaults !== undefined}
            defaultValue={defaults?.effective_from ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="effective_to">Effective to</Label>
          <Input
            id="effective_to"
            name="effective_to"
            type="date"
            defaultValue={defaults?.effective_to ?? ""}
          />
        </div>
      </div>
      <div className="flex items-center gap-4 border-t border-line pt-5">
        <Button type="submit">{submitLabel}</Button>
        <Link href={cancelHref} className="px-1 text-sm font-bold text-brand-link hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
