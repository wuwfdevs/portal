import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
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
        <h2 className="mb-3 font-serif text-[17px] font-bold text-ink-900">Public form</h2>
        {isCoordinator ? (
          <form action={updateSettings} className="flex max-w-2xl flex-col gap-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-ink-800">
              <input type="checkbox" name="is_open" defaultChecked={settings.is_open} />
              Accepting submissions
            </label>

            <div>
              <Label htmlFor="intro_copy">Introductory copy</Label>
              <Textarea id="intro_copy" name="intro_copy" rows={4} defaultValue={settings.intro_copy} />
            </div>
            <div>
              <Label htmlFor="confirmation_copy">Confirmation copy</Label>
              <Textarea
                id="confirmation_copy"
                name="confirmation_copy"
                rows={4}
                defaultValue={settings.confirmation_copy}
              />
            </div>
            <div>
              <Label htmlFor="google_appointments_url">Google Appointments URL</Label>
              <Input
                id="google_appointments_url"
                name="google_appointments_url"
                type="url"
                defaultValue={settings.google_appointments_url ?? ""}
                placeholder="https://calendar.app.google/…"
              />
            </div>
            <fieldset>
              <legend className="mb-1.5 text-xs font-semibold text-ink-700">
                Enabled partnership types
              </legend>
              <div className="flex flex-col gap-1.5">
                {PARTNERSHIP_TYPES.map((type) => (
                  <label key={type} className="flex items-center gap-2 text-sm text-ink-800">
                    <input
                      type="checkbox"
                      name="enabled_partnership_types"
                      value={type}
                      defaultChecked={settings.enabled_partnership_types.includes(type)}
                    />
                    {PARTNERSHIP_TYPE_LABEL[type]}
                  </label>
                ))}
              </div>
            </fieldset>
            <Button type="submit" className="self-start">
              Save
            </Button>
          </form>
        ) : (
          <dl className="max-w-2xl text-sm text-ink-700">
            <dt className="font-semibold">Status</dt>
            <dd className="mb-2">{settings.is_open ? "Accepting submissions" : "Closed"}</dd>
            <dt className="font-semibold">Enabled types</dt>
            <dd>
              {settings.enabled_partnership_types.map((type) => PARTNERSHIP_TYPE_LABEL[type]).join(", ")}
            </dd>
          </dl>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-serif text-[17px] font-bold text-ink-900">Email templates</h2>
        <div className="flex max-w-2xl flex-col gap-4">
          {templates.map((template) => (
            <details key={template.key} className="rounded border border-line p-3">
              <summary className="cursor-pointer text-sm font-semibold text-ink-800">
                {template.label}
              </summary>
              {isCoordinator ? (
                <form action={updateEmailTemplate} className="mt-3 flex flex-col gap-3">
                  <input type="hidden" name="key" value={template.key} />
                  <div>
                    <Label htmlFor={`subject-${template.key}`}>Subject</Label>
                    <Input id={`subject-${template.key}`} name="subject" defaultValue={template.subject} />
                  </div>
                  <div>
                    <Label htmlFor={`body-${template.key}`}>Body</Label>
                    <Textarea
                      id={`body-${template.key}`}
                      name="body"
                      rows={8}
                      defaultValue={template.body}
                    />
                  </div>
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
