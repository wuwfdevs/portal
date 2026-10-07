import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  EDITORIAL_REVIEW_LABEL,
  PARTNER_KIND_LABEL,
  REQUESTED_LABEL,
  TITLE_MAX,
} from "@/lib/bookings/projects";
import type { BkPartnerRow, BkProjectRow } from "@/lib/bookings/queries";
import { TextLink } from "@/components/ui/primary-link";

/**
 * The request's scope, shared by `/requests/new` and `/requests/[id]/edit`
 * (docs/ui-patterns.md: edit reuses the create form). The partner is a
 * search-to-select over those on file, with a "new partner" block beneath
 * for one that isn't; the action insists on exactly one of the two.
 */
export function RequestForm({
  action,
  partners,
  project,
  error,
  cancelHref,
}: {
  action: (formData: FormData) => void | Promise<void>;
  partners: BkPartnerRow[];
  project?: BkProjectRow;
  error?: string;
  cancelHref: string;
}) {
  return (
    <form action={action} className="flex max-w-3xl flex-col gap-6">
      {project && <input type="hidden" name="project_id" value={project.id} />}
      {error && <Alert>{error}</Alert>}

      <Card>
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
          The request
        </div>
        <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              required
              maxLength={TITLE_MAX}
              defaultValue={project?.title ?? ""}
              placeholder="Board of Trustees meeting webcast"
              autoFocus={!project}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="description">What is asked for</Label>
            <Textarea
              id="description"
              name="description"
              rows={4}
              defaultValue={project?.description ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="requested">Asks for</Label>
            <Select
              id="requested"
              name="requested"
              defaultValue={project?.requested ?? "production"}
            >
              {(Object.keys(REQUESTED_LABEL) as (keyof typeof REQUESTED_LABEL)[]).map((key) => (
                <option key={key} value={key}>
                  {REQUESTED_LABEL[key]}
                </option>
              ))}
            </Select>
            <FieldHint>
              Production is packages and dates; airtime is a commitment honored in Traffic or On
              Air.
            </FieldHint>
          </div>
          <div>
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              name="location"
              maxLength={200}
              defaultValue={project?.location ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="event_starts_on">Event starts</Label>
            <Input
              id="event_starts_on"
              name="event_starts_on"
              type="date"
              defaultValue={project?.event_starts_on ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="event_ends_on">Event ends</Label>
            <Input
              id="event_ends_on"
              name="event_ends_on"
              type="date"
              defaultValue={project?.event_ends_on ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="deliverables_due_on">Deliverables due</Label>
            <Input
              id="deliverables_due_on"
              name="deliverables_due_on"
              type="date"
              defaultValue={project?.deliverables_due_on ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="funding_index">Funding index</Label>
            <Input
              id="funding_index"
              name="funding_index"
              maxLength={60}
              defaultValue={project?.funding_index ?? ""}
            />
            <FieldHint>
              Where a recharge goes; the partner&apos;s default is used when blank.
            </FieldHint>
          </div>
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
          The partner
        </div>
        <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="partner_id">Partner on file</Label>
            <SearchableSelect
              id="partner_id"
              name="partner_id"
              options={partners.map((partner) => ({
                id: partner.id,
                label: partner.name,
                hint: PARTNER_KIND_LABEL[partner.kind],
              }))}
              defaultValue={project?.partner_id}
              placeholder={
                partners.length === 0
                  ? "No partners on file yet — name one below"
                  : "Type to search…"
              }
              emptyMessage="No partner by that name — name a new one below."
            />
          </div>
          <div>
            <Label htmlFor="new_partner_name">Or a new partner</Label>
            <Input
              id="new_partner_name"
              name="new_partner_name"
              maxLength={160}
              placeholder="UWF Libraries"
            />
          </div>
          <div>
            <Label htmlFor="new_partner_kind">The new partner is</Label>
            <Select id="new_partner_kind" name="new_partner_kind" defaultValue="uwf_unit">
              <option value="uwf_unit">{PARTNER_KIND_LABEL.uwf_unit}</option>
              <option value="external">{PARTNER_KIND_LABEL.external}</option>
            </Select>
            <FieldHint>
              An outside partner is priced external: full cost, the assessment and the margin.
            </FieldHint>
          </div>
          <div>
            <Label htmlFor="contact_name">Contact</Label>
            <Input
              id="contact_name"
              name="contact_name"
              maxLength={160}
              defaultValue={project?.contact_name ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="contact_email">Contact email</Label>
            <Input
              id="contact_email"
              name="contact_email"
              type="email"
              maxLength={160}
              defaultValue={project?.contact_email ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="contact_phone">Contact phone</Label>
            <Input
              id="contact_phone"
              name="contact_phone"
              maxLength={40}
              defaultValue={project?.contact_phone ?? ""}
            />
          </div>
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
          Judgments
        </div>
        <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="qualifies_strategic">
              Qualifies as strategic or applied-learning work?
            </Label>
            <Select
              id="qualifies_strategic"
              name="qualifies_strategic"
              defaultValue={
                project?.qualifies_strategic === null || project?.qualifies_strategic === undefined
                  ? ""
                  : project.qualifies_strategic
                    ? "yes"
                    : "no"
              }
            >
              <option value="">Not decided yet</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
            <FieldHint>
              The lead&apos;s judgment; the executive confirms when contested. Qualifying work is
              priced strategic when the reserve covers its professional hours.
            </FieldHint>
          </div>
          <div>
            <Label htmlFor="editorial_review">Editorial review</Label>
            <Select
              id="editorial_review"
              name="editorial_review"
              defaultValue={project?.editorial_review ?? "not_needed"}
            >
              {(Object.keys(EDITORIAL_REVIEW_LABEL) as (keyof typeof EDITORIAL_REVIEW_LABEL)[]).map(
                (key) => (
                  <option key={key} value={key}>
                    {EDITORIAL_REVIEW_LABEL[key]}
                  </option>
                ),
              )}
            </Select>
            <FieldHint>
              Needed for a feature hosted by a university administrator; Content &amp; Audience
              leadership clears it.
            </FieldHint>
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-4">
        <Button type="submit">{project ? "Save the request" : "Create the request"}</Button>
        <TextLink href={cancelHref}>Cancel</TextLink>
      </div>
    </form>
  );
}
