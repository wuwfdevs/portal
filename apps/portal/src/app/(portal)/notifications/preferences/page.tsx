import { requireActiveProfile } from "@/lib/auth/authz";
import { notificationTypesByGroup } from "@/lib/notifications/catalog";
import { emailFieldName, inAppFieldName, resolveChannels } from "@/lib/notifications/preferences";
import { listStoredPreferences } from "@/lib/notifications/queries";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { FormActions } from "@/components/ui/form-actions";
import { CheckboxField } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { savePreferences } from "../actions";

export const metadata = { title: "Notification preferences" };

export default async function NotificationPreferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;
  const profile = await requireActiveProfile();
  const stored = new Map((await listStoredPreferences(profile.id)).map((row) => [row.type, row]));

  return (
    <div className="max-w-3xl px-6 py-7 sm:px-8 sm:pb-12">
      <PageHeader
        back={{ href: "/notifications", label: "Notifications" }}
        title="Notification preferences"
        description={`Choose what you are told about, and where. Email goes to ${profile.email}. You are only told about tools you can open.`}
      />
      {error && <Alert className="mt-4">{error}</Alert>}
      {saved && !error && (
        <Alert variant="success" className="mt-4">
          Saved.
        </Alert>
      )}

      <form action={savePreferences} className="mt-6 flex flex-col gap-5">
        {notificationTypesByGroup().map(({ group, types }) => (
          <Card key={group}>
            <fieldset className="p-5">
              <legend className="font-serif text-section font-bold text-ink-900">{group}</legend>
              <div className="mt-3 hidden grid-cols-[1fr_auto_auto] gap-x-6 text-label font-bold uppercase tracking-wide text-ink-500 sm:grid">
                <span />
                <span className="w-24 text-center">Notifications</span>
                <span className="w-24 text-center">Email</span>
              </div>
              <ul className="divide-y divide-line">
                {types.map((def) => {
                  const channels = resolveChannels(def, stored.get(def.key));
                  return (
                    <li
                      key={def.key}
                      className="grid gap-x-6 gap-y-2 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <p className="text-body font-semibold text-ink-900">{def.label}</p>
                        <p className="mt-0.5 text-ui text-ink-500">{def.description}</p>
                        <p className="mt-0.5 text-meta text-ink-400">Told: {def.audience}</p>
                      </div>
                      <CheckboxField
                        name={inAppFieldName(def.key)}
                        defaultChecked={channels.inApp}
                        className="items-center sm:w-24 sm:justify-center"
                        label={<span className="sm:sr-only">Notifications</span>}
                      />
                      <CheckboxField
                        name={emailFieldName(def.key)}
                        defaultChecked={channels.email}
                        className="items-center sm:w-24 sm:justify-center"
                        label={<span className="sm:sr-only">Email</span>}
                      />
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          </Card>
        ))}
        <FormActions cancelHref="/notifications">
          <Button type="submit">Save preferences</Button>
        </FormActions>
      </form>
    </div>
  );
}
