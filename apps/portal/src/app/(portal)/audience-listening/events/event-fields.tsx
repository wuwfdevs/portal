import { CheckboxField, Field, Input, Select, Textarea } from "@/components/ui/input";
import { utcToStationInput } from "@/lib/audience-listening/event-times";
import { MAX_SEATS, ORGANIZER_KIND_LABEL, SEAT_CHOICES, VISIBILITY_LABEL } from "@/lib/audience-listening/events";
import type { AlEvent } from "@/lib/audience-listening/campaign-queries";

/** The fields an event is made and edited with. The page's form owns the <form> and its footer. */
export function EventFields({ event, showNotes }: { event?: AlEvent; showNotes?: boolean }) {
  return (
    <>
      <Field label="Title" htmlFor="title" hint="For a public event this is what the website lists.">
        <Input id="title" name="title" required maxLength={200} defaultValue={event?.title ?? ""} placeholder="Listening night at the library" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts" htmlFor="starts_at" hint="In the station's time. Inside the campaign's dates.">
          <Input id="starts_at" name="starts_at" type="datetime-local" required defaultValue={utcToStationInput(event?.starts_at)} />
        </Field>
        <Field label="Ends" htmlFor="ends_at">
          <Input id="ends_at" name="ends_at" type="datetime-local" required defaultValue={utcToStationInput(event?.ends_at)} />
        </Field>
      </div>
      <Field label="Place" htmlFor="place_name" hint="For example a library branch, a church hall, or a kitchen.">
        <Input id="place_name" name="place_name" required maxLength={200} defaultValue={event?.place_name ?? ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Address" htmlFor="address" hint="Required for a public event.">
          <Input id="address" name="address" maxLength={500} defaultValue={event?.address ?? ""} />
        </Field>
        <Field label="City" htmlFor="city">
          <Input id="city" name="city" maxLength={120} defaultValue={event?.city ?? ""} />
        </Field>
      </div>
      <Field
        label="Who can find it"
        htmlFor="visibility"
        hint="A private event is never listed; the organizer shares it. A public event may be listed on the website once a coordinator approves it."
      >
        <Select id="visibility" name="visibility" defaultValue={event?.visibility ?? "private"}>
          {(["private", "public"] as const).map((v) => (
            <option key={v} value={v}>
              {VISIBILITY_LABEL[v]}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Seats"
        htmlFor="seats"
        hint={`For a public event only; ignored for a private one. A whole number up to ${MAX_SEATS}. The website offers ${SEAT_CHOICES.join(", ")}.`}
      >
        <Input id="seats" name="seats" type="number" inputMode="numeric" min={1} max={MAX_SEATS} defaultValue={event?.seats ?? ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Organized by" htmlFor="organizer_kind">
          <Select id="organizer_kind" name="organizer_kind" defaultValue={event?.organizer_kind ?? "wuwf"}>
            {(["wuwf", "partner", "person"] as const).map((k) => (
              <option key={k} value={k}>
                {ORGANIZER_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Organizer's name" htmlFor="organizer_label" hint="As the website should say it. Optional.">
          <Input id="organizer_label" name="organizer_label" maxLength={200} defaultValue={event?.organizer_label ?? ""} />
        </Field>
      </div>
      <CheckboxField name="wuwf_journalist_joining" label="A journalist from the station is joining" defaultChecked={event?.wuwf_journalist_joining ?? false} />
      {showNotes && (
        <Field label="Private notes" htmlFor="internal_notes" hint="Staff only.">
          <Textarea id="internal_notes" name="internal_notes" rows={3} maxLength={4000} defaultValue={event?.internal_notes ?? ""} />
        </Field>
      )}
    </>
  );
}
