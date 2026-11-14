import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { FormActions } from "@/components/ui/form-actions";
import { getStation } from "@/lib/station";
import { STATION_TIME_ZONE } from "@/lib/station-time";
import { updateStation } from "./actions";

export default async function AdminStationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;
  const station = await getStation();

  return (
    <div className="mt-5 max-w-2xl">
      <p className="mb-4 text-ui text-ink-500">
        How this station names itself: on the sign-in page, on the public forms, in the page title
        and in what the assistant is told. Anything left empty falls back to neutral wording, never
        to another station&apos;s name.
      </p>
      {error && <Alert className="mb-4">{error}</Alert>}
      {saved && !error && (
        <Alert variant="success" className="mb-4">
          Saved.
        </Alert>
      )}
      {station.zoneMismatch && <Alert className="mb-4">{station.zoneMismatch}</Alert>}
      <Card>
        <form action={updateStation} className="flex flex-col gap-4 p-5">
          <Field
            label="Station name"
            htmlFor="display_name"
            hint="The full name, as a masthead would print it."
          >
            <Input
              id="display_name"
              name="display_name"
              defaultValue={station.display_name ?? ""}
              maxLength={120}
            />
          </Field>
          <Field
            label="Short name"
            htmlFor="short_name"
            hint="How a sentence refers to the station, and the title of this site: “Short name Tools”."
          >
            <Input
              id="short_name"
              name="short_name"
              defaultValue={station.short_name ?? ""}
              maxLength={40}
            />
          </Field>
          <Field label="Call sign" htmlFor="call_sign">
            <Input
              id="call_sign"
              name="call_sign"
              defaultValue={station.call_sign ?? ""}
              maxLength={40}
            />
          </Field>
          <Field
            label="Licensee"
            htmlFor="licensee"
            hint="Who holds the license, for documents that name them."
          >
            <Input
              id="licensee"
              name="licensee"
              defaultValue={station.licensee ?? ""}
              maxLength={160}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City" htmlFor="primary_city">
              <Input
                id="primary_city"
                name="primary_city"
                defaultValue={station.primary_city ?? ""}
                maxLength={80}
              />
            </Field>
            <Field label="State or region" htmlFor="region">
              <Input id="region" name="region" defaultValue={station.region ?? ""} maxLength={80} />
            </Field>
          </div>
          <Field
            label="Who the station serves"
            htmlFor="coverage_area"
            hint="In your own words, for the assistant: “Pensacola and Northwest Florida”."
          >
            <Input
              id="coverage_area"
              name="coverage_area"
              defaultValue={station.coverage_area ?? ""}
              maxLength={160}
            />
          </Field>
          <Field label="Mailing address" htmlFor="mailing_address">
            <Textarea
              id="mailing_address"
              name="mailing_address"
              defaultValue={station.mailing_address ?? ""}
              maxLength={400}
              rows={3}
            />
          </Field>
          <Field
            label="Support email"
            htmlFor="support_email"
            hint="Shown on the sign-in page as “Get help signing in”."
          >
            <Input
              id="support_email"
              name="support_email"
              type="email"
              defaultValue={station.support_email ?? ""}
              maxLength={200}
            />
          </Field>
          <Field
            label="Sign-off on public forms"
            htmlFor="public_attribution"
            hint="The last line under a thank-you: “— Station name, City, ST”."
          >
            <Input
              id="public_attribution"
              name="public_attribution"
              defaultValue={station.public_attribution ?? ""}
              maxLength={200}
            />
          </Field>

          <fieldset className="flex flex-col gap-4 border-t border-line pt-4">
            <legend className="text-ui font-semibold text-ink-900">Website and Audience Listening</legend>
            <p className="-mt-2 text-ui text-ink-500">
              Where the public website is, so the links Audience Listening prints on table cards and
              emails to facilitators and organizers point at it; and the one shared mailbox that
              gets its reminders. Both are used only when filled in here or in the server&apos;s
              settings.
            </p>
            <Field
              label="Website address"
              htmlFor="website_origin"
              hint="The address only, with https and no path, for example https://www.example.org. A table link, an after-page link and an organizer link are built from it."
            >
              <Input
                id="website_origin"
                name="website_origin"
                type="url"
                inputMode="url"
                defaultValue={station.website_origin ?? ""}
                maxLength={200}
              />
            </Field>
            <Field
              label="Audience Listening mailbox"
              htmlFor="listening_notify_email"
              hint="One shared address, not a person. It gets a note when someone asks to host a session, a daily note when questions or requests are waiting, and a weekly note when recordings are past thirty days. The notes carry counts and a link, never what anyone wrote."
            >
              <Input
                id="listening_notify_email"
                name="listening_notify_email"
                type="email"
                defaultValue={station.listening_notify_email ?? ""}
                maxLength={320}
              />
            </Field>
          </fieldset>

          <fieldset className="flex flex-col gap-4 border-t border-line pt-4">
            <legend className="text-ui font-semibold text-ink-900">Weather</legend>
            <p className="-mt-2 text-ui text-ink-500">
              Where the studio is, so the forecast read on air is yours, and which counties&apos;
              alerts to relay. Leave the location empty and there is no weather reading until it is
              set.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Studio latitude"
                htmlFor="latitude"
                hint="Decimal degrees, for example 30.5433"
              >
                <Input
                  id="latitude"
                  name="latitude"
                  inputMode="decimal"
                  defaultValue={station.latitude ?? ""}
                />
              </Field>
              <Field
                label="Studio longitude"
                htmlFor="longitude"
                hint="Negative in the Americas, for example -87.2169"
              >
                <Input
                  id="longitude"
                  name="longitude"
                  inputMode="decimal"
                  defaultValue={station.longitude ?? ""}
                />
              </Field>
            </div>
            <Field
              label="Counties whose alerts to relay"
              htmlFor="alert_counties"
              hint="One per line: the county's name, a colon, and its six-digit SAME code, in the order they should be listed. Example: Escambia:012033. Leave empty to relay every alert National Weather Service matches to the studio."
            >
              <Textarea
                id="alert_counties"
                name="alert_counties"
                defaultValue={station.alert_counties ?? ""}
                rows={5}
                maxLength={1000}
                className="font-mono"
              />
            </Field>
          </fieldset>

          <fieldset className="flex flex-col gap-4 border-t border-line pt-4">
            <legend className="text-ui font-semibold text-ink-900">
              Notice under public forms
            </legend>
            <p className="-mt-2 text-ui text-ink-500">
              A line shown under every public page that collects information, such as a
              licensee&apos;s privacy policy. Leave all three empty for none.
            </p>
            <Field label="Words before the link" htmlFor="public_notice_text">
              <Input
                id="public_notice_text"
                name="public_notice_text"
                defaultValue={station.public_notice_text ?? ""}
                maxLength={300}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Link text" htmlFor="public_notice_link_label">
                <Input
                  id="public_notice_link_label"
                  name="public_notice_link_label"
                  defaultValue={station.public_notice_link_label ?? ""}
                  maxLength={160}
                />
              </Field>
              <Field
                label="Link address"
                htmlFor="public_notice_link_url"
                hint="Starts with / or https://"
              >
                <Input
                  id="public_notice_link_url"
                  name="public_notice_link_url"
                  defaultValue={station.public_notice_link_url ?? ""}
                  maxLength={300}
                />
              </Field>
            </div>
          </fieldset>

          <div className="border-t border-line pt-4">
            <p className="text-ui font-semibold text-ink-900">Time zone</p>
            <p className="mt-1 text-ui text-ink-500">
              <span className="font-mono">{station.time_zone}</span> in settings;{" "}
              <span className="font-mono">{STATION_TIME_ZONE}</span> in this deployment. It is set
              when the station is installed (
              <span className="font-mono">NEXT_PUBLIC_STATION_TIME_ZONE</span> and the settings row
              must match), so it is not edited here.
            </p>
          </div>

          <FormActions cancelHref="/admin/tools" className="border-t border-line pt-4">
            <Button type="submit">Save station settings</Button>
          </FormActions>
        </form>
      </Card>
    </div>
  );
}
