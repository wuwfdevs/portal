import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DescriptionList } from "@/components/ui/description-list";
import { SectionHeading } from "@/components/ui/section-heading";
import { CheckboxField, Field, Input, Textarea } from "@/components/ui/input";
import { requireAcademicPartnershipsAccess } from "@/lib/academic-partnerships/access";
import { getSettings, listEmailTemplates } from "@/lib/academic-partnerships/queries";
import {
  PARTNERSHIP_TYPES,
  PARTNERSHIP_TYPE_LABEL,
} from "@/lib/academic-partnerships/partnership-types";
import { getSiteUrl } from "@/lib/site-url";
import { updateEmailTemplate, updateSettings } from "./actions";
import { SharePanel } from "./share-panel";

export default async function AcademicPartnershipsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { isCoordinator } = await requireAcademicPartnershipsAccess();
  const [settings, templates] = await Promise.all([getSettings(), listEmailTemplates()]);

  return (
    <div className="flex flex-col gap-8">
      {error && <Alert variant="danger">{error}</Alert>}
      {!isCoordinator && (
        <Alert variant="note">
          You can view these settings, but only a coordinator can change them.
        </Alert>
      )}

      <SharePanel siteUrl={getSiteUrl()} />

      <section>
        <SectionHeading className="mb-3">Public form</SectionHeading>
        {isCoordinator ? (
          <form action={updateSettings} className="flex max-w-2xl flex-col gap-4">
            <CheckboxField
              name="is_open"
              defaultChecked={settings.is_open}
              label="Accepting submissions"
              className="font-semibold"
            />

            <Field label="Introductory copy" htmlFor="intro_copy">
              <Textarea
                id="intro_copy"
                name="intro_copy"
                rows={4}
                defaultValue={settings.intro_copy}
              />
            </Field>
            <Field label="Confirmation copy" htmlFor="confirmation_copy">
              <Textarea
                id="confirmation_copy"
                name="confirmation_copy"
                rows={4}
                defaultValue={settings.confirmation_copy}
              />
            </Field>
            <Field label="Google Appointments URL" htmlFor="google_appointments_url">
              <Input
                id="google_appointments_url"
                name="google_appointments_url"
                type="url"
                defaultValue={settings.google_appointments_url ?? ""}
                placeholder="https://calendar.app.google/…"
              />
            </Field>
            <fieldset>
              <legend className="mb-1.5 text-xs font-semibold text-ink-700">
                Enabled partnership types
              </legend>
              <div className="flex flex-col gap-1.5">
                {PARTNERSHIP_TYPES.map((type) => (
                  <CheckboxField
                    key={type}
                    name="enabled_partnership_types"
                    value={type}
                    defaultChecked={settings.enabled_partnership_types.includes(type)}
                    label={PARTNERSHIP_TYPE_LABEL[type]}
                  />
                ))}
              </div>
            </fieldset>
            <Button type="submit" className="self-start">
              Save
            </Button>
          </form>
        ) : (
          <DescriptionList
            className="max-w-2xl"
            items={[
              { label: "Status", value: settings.is_open ? "Accepting submissions" : "Closed" },
              {
                label: "Enabled types",
                value: settings.enabled_partnership_types
                  .map((type) => PARTNERSHIP_TYPE_LABEL[type])
                  .join(", "),
              },
            ]}
          />
        )}
      </section>

      <section>
        <SectionHeading className="mb-3">Email templates</SectionHeading>
        <div className="flex max-w-2xl flex-col gap-4">
          {templates.map((template) => (
            <details key={template.key} className="rounded border border-line p-3">
              <summary className="cursor-pointer text-sm font-semibold text-ink-800">
                {template.label}
              </summary>
              {isCoordinator ? (
                <form action={updateEmailTemplate} className="mt-3 flex flex-col gap-3">
                  <input type="hidden" name="key" value={template.key} />
                  <Field label="Subject" htmlFor={`subject-${template.key}`}>
                    <Input
                      id={`subject-${template.key}`}
                      name="subject"
                      defaultValue={template.subject}
                    />
                  </Field>
                  <Field label="Body" htmlFor={`body-${template.key}`}>
                    <Textarea
                      id={`body-${template.key}`}
                      name="body"
                      rows={8}
                      defaultValue={template.body}
                    />
                  </Field>
                  <p className="text-xs text-ink-400">
                    Available tokens: {"{{faculty_name}}"}, {"{{appointments_url}}"},{" "}
                    {"{{staff_context}}"}
                  </p>
                  <Button type="submit" variant="secondary" className="self-start">
                    Save template
                  </Button>
                </form>
              ) : (
                <div className="mt-3 whitespace-pre-wrap text-xs text-ink-600">{template.body}</div>
              )}
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
