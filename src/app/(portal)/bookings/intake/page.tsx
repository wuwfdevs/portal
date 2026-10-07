import { Card } from "@/components/ui/card";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Label, Textarea } from "@/components/ui/input";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { REQUESTS_PATH } from "@/lib/bookings/paths";
import { getIntakeSettings } from "@/lib/bookings/queries";
import { getSiteUrl } from "@/lib/site-url";
import { formatDateShort } from "@/lib/log/program-status";
import { updateIntakeSettings } from "./actions";
import { SharePanel } from "./share-panel";

/**
 * The public request form's settings and its embed snippet (docs/
 * bookings-design.md §4, "/bookings/intake", under Requests). A detail-shaped
 * page: the form on the left, the link, snippet and preview as the right
 * column (docs/ui-patterns.md: a right column is context on a detail page).
 */
export default async function IntakeSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const [query, context] = await Promise.all([searchParams, requireBookingsAccess()]);
  const settings = await getIntakeSettings();
  const canEdit = context.isDirector || context.isExecutive;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={REQUESTS_PATH} className="text-xs font-bold text-brand-link hover:underline">
          ← Requests
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h2 className="font-serif text-[17px] font-bold text-ink-900">The public request form</h2>
          <Badge variant={settings.is_open ? "success" : "neutral"}>
            {settings.is_open ? "Taking requests" : "Closed"}
          </Badge>
          {query.saved && <Badge variant="success">Saved</Badge>}
        </div>
        <p className="mt-1 max-w-2xl text-xs text-ink-500">
          A university unit or an outside organization asks for production, airtime or both here.
          Each submission lands in Requests at the Request stage, with its own partner named, for
          production staff to estimate. No rate appears on the form.
        </p>
      </div>

      {query.error && <Alert>{query.error}</Alert>}
      {!canEdit && (
        <Alert variant="note">
          You can view these settings; the Director of Operations or the Executive Director changes
          them.
        </Alert>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <Card className="min-w-0 flex-1">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
            Settings
          </div>
          {canEdit ? (
            <form action={updateIntakeSettings} className="flex flex-col gap-4 px-5 py-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-ink-800">
                <input type="checkbox" name="is_open" defaultChecked={settings.is_open} />
                Taking requests
              </label>
              <div>
                <Label htmlFor="intro_copy">Introduction</Label>
                <Textarea
                  id="intro_copy"
                  name="intro_copy"
                  rows={4}
                  defaultValue={settings.intro_copy}
                />
                <FieldHint>Shown above the first step.</FieldHint>
              </div>
              <div>
                <Label htmlFor="confirmation_copy">After a request is sent</Label>
                <Textarea
                  id="confirmation_copy"
                  name="confirmation_copy"
                  rows={3}
                  defaultValue={settings.confirmation_copy}
                />
              </div>
              <div>
                <Label htmlFor="closed_copy">While the form is closed</Label>
                <Textarea
                  id="closed_copy"
                  name="closed_copy"
                  rows={3}
                  defaultValue={settings.closed_copy}
                />
              </div>
              <div>
                <Label htmlFor="offered_packages">Services offered</Label>
                <Textarea
                  id="offered_packages"
                  name="offered_packages"
                  rows={5}
                  defaultValue={settings.offered_packages.join("\n")}
                />
                <FieldHint>
                  One a line, as the form should name them. A request records the names chosen;
                  production staff add the real estimate lines from the rate card.
                </FieldHint>
              </div>
              <div>
                <Button type="submit">Save</Button>
              </div>
            </form>
          ) : (
            <dl className="grid grid-cols-1 gap-4 px-5 py-4 text-sm">
              <div>
                <dt className="text-xs font-semibold text-ink-500">Introduction</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-ink-800">{settings.intro_copy}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-ink-500">After a request is sent</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-ink-800">
                  {settings.confirmation_copy}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-ink-500">While the form is closed</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-ink-800">{settings.closed_copy}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-ink-500">Services offered</dt>
                <dd className="mt-0.5 text-ink-800">{settings.offered_packages.join(", ")}</dd>
              </div>
            </dl>
          )}
          <p className="border-t border-line px-5 py-3 text-xs text-ink-400">
            Last changed {formatDateShort(settings.updated_at.slice(0, 10))}.
          </p>
        </Card>

        <aside className="w-full lg:w-96 lg:shrink-0">
          <SharePanel siteUrl={getSiteUrl()} />
        </aside>
      </div>
    </div>
  );
}
