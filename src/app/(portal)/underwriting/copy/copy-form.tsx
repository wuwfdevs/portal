import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ChoiceCards } from "@/components/ui/choice-cards";
import { FieldHint, Input, Label } from "@/components/ui/input";
import type { UwCopyRow } from "@/lib/underwriting/queries";
import { spotNumberFromScript } from "@/lib/underwriting/dad-cut";
import { DadCutField } from "./dad-cut-field";
import { ScriptField } from "./script-field";

export type CopyFormDefaults = Pick<
  UwCopyRow,
  | "label"
  | "execution_kind"
  | "script"
  | "duration_seconds"
  | "dad_cut"
  | "effective_from"
  | "effective_to"
>;

/**
 * The one set of copy fields (docs/ui-patterns.md rule 3), rendered by the
 * library's standalone create/edit form below and by the contract's own
 * inline "New message" and in-place edit cards (contracts/[id]/copy-
 * panel.tsx) — the card owns the <form>, this renders only fields, the
 * same split as the Editorial settings' AddFieldFields. `idPrefix` keeps
 * ids unique when a page shows more than one copy form.
 */
export function CopyFormFields({
  defaults,
  idPrefix = "copy",
  effectiveFromDefault,
}: {
  defaults?: CopyFormDefaults;
  idPrefix?: string;
  /** For a new message: the contract's start, so the field isn't blank. */
  effectiveFromDefault?: string;
}) {
  const id = (field: string) => `${idPrefix}_${field}`;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className="mb-1.5 block text-xs font-semibold text-ink-700">
          How it airs when a host is on
        </span>
        <ChoiceCards
          name="execution_kind"
          columns={2}
          defaultValue={defaults?.execution_kind ?? "live_read"}
          options={[
            {
              value: "live_read",
              title: "Live read",
              description:
                "The host reads the script. In hours with no host, DAD plays its recorded version.",
            },
            {
              value: "recorded",
              title: "Recorded spot",
              description: "DAD always plays the recording, whether or not a host is on air.",
            },
          ]}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
        <div>
          <Label htmlFor={id("label")}>Label</Label>
          <Input
            id={id("label")}
            name="label"
            required
            maxLength={80}
            placeholder="Message A"
            defaultValue={defaults?.label ?? ""}
            autoFocus
          />
          <FieldHint>
            How the message is referred to on the rundown and in the library — the sponsor&apos;s
            own name for it, if the order gives one.
          </FieldHint>
        </div>
        <div>
          <Label htmlFor={id("duration")}>Timed duration (s)</Label>
          <Input
            id={id("duration")}
            name="duration_seconds"
            type="number"
            min={1}
            placeholder="Estimate"
            defaultValue={defaults?.duration_seconds ?? ""}
          />
          <FieldHint>
            Blank uses the estimate; a recorded spot needs its audio&apos;s length.
          </FieldHint>
        </div>
      </div>
      <ScriptField id={id("script")} defaultValue={defaults?.script ?? ""} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={id("from")}>Effective from</Label>
          <Input
            id={id("from")}
            name="effective_from"
            type="date"
            required={defaults !== undefined}
            defaultValue={defaults?.effective_from ?? effectiveFromDefault ?? ""}
          />
          {effectiveFromDefault && !defaults && (
            <FieldHint>Defaults to the contract&apos;s start.</FieldHint>
          )}
        </div>
        <div>
          <Label htmlFor={id("to")}>Effective to</Label>
          <Input
            id={id("to")}
            name="effective_to"
            type="date"
            defaultValue={defaults?.effective_to ?? ""}
          />
          <FieldHint>Blank runs until retired.</FieldHint>
        </div>
      </div>
      <DadCutField
        idPrefix={idPrefix}
        currentCut={defaults?.dad_cut ?? null}
        suggestedSpot={spotNumberFromScript(defaults?.script)}
      />
    </div>
  );
}

/** The copy library's standalone create/edit form, shared by /copy/new and /copy/[id]/edit. */
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
      <CopyFormFields defaults={defaults} />
      <div className="flex items-center gap-4 border-t border-line pt-5">
        <Button type="submit">{submitLabel}</Button>
        <Link href={cancelHref} className="px-1 text-sm font-bold text-brand-link hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
