"use client";

import { Card } from "@/components/ui/card";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea, CheckboxField } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TITLE_MAX } from "@/lib/bookings/projects";
import { TextLink } from "@/components/ui/primary-link";

export interface FormPartner {
  id: string;
  name: string;
  kind: "uwf_unit" | "external";
  kindLabel: string;
  contactName: string | null;
  contactEmail: string | null;
  defaultFundingIndex: string | null;
}

export interface FormPackage {
  id: string;
  name: string;
  unitLabel: string;
  /** What it includes, in a phrase: "5 staff hours, 10 student hours". */
  includes: string;
}

export interface TimeOfDayChoice {
  key: string;
  label: string;
}

/**
 * New request, in one pass (docs/bookings-design.md §18.1): the partner, what
 * is wanted, and the date — submitting prices the estimate and holds the plan
 * for the dates. Everything else is under "More details". The yes/no on
 * strategic work appears only for a UWF unit (§18.5).
 */
export function NewRequestForm({
  action,
  partners,
  packages,
  timesOfDay,
  error,
  cancelHref,
  noRateCard,
}: {
  action: (formData: FormData) => void | Promise<void>;
  partners: FormPartner[];
  packages: FormPackage[];
  timesOfDay: TimeOfDayChoice[];
  error?: string;
  cancelHref: string;
  noRateCard: boolean;
}) {
  const [partnerId, setPartnerId] = useState("");
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<"uwf_unit" | "external">("uwf_unit");
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const anyTicked = Object.values(ticked).some(Boolean);

  const chosen = partners.find((partner) => partner.id === partnerId) ?? null;
  const isUnit = chosen
    ? chosen.kind === "uwf_unit"
    : newName.trim() !== "" && newKind === "uwf_unit";

  return (
    <form action={action} className="flex max-w-3xl flex-col gap-5">
      {error && <Alert>{error}</Alert>}
      {noRateCard && (
        <Alert variant="note">
          No rate card is recorded for estimates yet, so a service can&apos;t be priced. Finance
          records one on the Rates tab; you can still enter the request.
        </Alert>
      )}

      <Card>
        <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="partner_id">Who is it for?</Label>
            <SearchableSelect
              id="partner_id"
              name="partner_id"
              value={partnerId}
              onChange={setPartnerId}
              options={partners.map((partner) => ({
                id: partner.id,
                label: partner.name,
                hint: partner.kindLabel,
              }))}
              placeholder={
                partners.length === 0 ? "No one on file yet — add them below" : "Type to search…"
              }
              emptyMessage="No one by that name — add them below."
            />
            <details className="mt-2 text-sm" open={partners.length === 0}>
              <summary className="cursor-pointer text-xs font-bold text-brand-link">
                Not on file? Add them
              </summary>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="new_partner_name">Name</Label>
                  <Input
                    id="new_partner_name"
                    name="new_partner_name"
                    maxLength={160}
                    placeholder="UWF Libraries"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="new_partner_kind">They are</Label>
                  <Select
                    id="new_partner_kind"
                    name="new_partner_kind"
                    value={newKind}
                    onChange={(event) => setNewKind(event.target.value as "uwf_unit" | "external")}
                  >
                    <option value="uwf_unit">A UWF unit</option>
                    <option value="external">Outside the university</option>
                  </Select>
                </div>
              </div>
            </details>
          </div>

          {packages.length > 0 && (
            <fieldset className="sm:col-span-2">
              <legend className="mb-1.5 text-xs font-semibold text-ink-700">
                What do they need?
              </legend>
              <div className="flex flex-col divide-y divide-line rounded border border-line">
                {packages.map((pkg) => (
                  <div key={pkg.id} className="flex items-center gap-3 px-3 py-2.5">
                    <input
                      id={`pkg_${pkg.id}`}
                      type="checkbox"
                      name={`pkg_${pkg.id}`}
                      className="size-4"
                      checked={ticked[pkg.id] ?? false}
                      onChange={(event) =>
                        setTicked((current) => ({ ...current, [pkg.id]: event.target.checked }))
                      }
                    />
                    <label
                      htmlFor={`pkg_${pkg.id}`}
                      className="min-w-0 flex-1 text-sm text-ink-900"
                    >
                      <span className="font-semibold">{pkg.name}</span>{" "}
                      <span className="text-ink-500">({pkg.unitLabel})</span>
                      <span className="block text-xs text-ink-500">{pkg.includes}</span>
                    </label>
                    {ticked[pkg.id] && (
                      <span className="flex items-center gap-1.5 text-xs text-ink-500">
                        <label htmlFor={`qty_${pkg.id}`}>×</label>
                        <input
                          id={`qty_${pkg.id}`}
                          name={`qty_${pkg.id}`}
                          type="number"
                          min="0.25"
                          step="0.25"
                          defaultValue="1"
                          className="w-16 rounded border border-line px-2 py-1 text-base sm:text-sm"
                        />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </fieldset>
          )}

          <div>
            <Label htmlFor="event_starts_on">Event date</Label>
            <Input id="event_starts_on" name="event_starts_on" type="date" required={anyTicked} />
            <FieldHint>
              {anyTicked
                ? "We'll check the calendar and plan the dates for you."
                : "Needed once a service is chosen."}
            </FieldHint>
          </div>
          {timesOfDay.length > 0 && (
            <div>
              <Label htmlFor="window">Time of day</Label>
              <Select id="window" name="window" defaultValue="">
                <option value="">First available</option>
                {timesOfDay.map((choice) => (
                  <option key={choice.key} value={choice.key}>
                    {choice.label}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {isUnit && (
            <fieldset className="sm:col-span-2">
              <legend className="mb-1.5 text-xs font-semibold text-ink-700">
                Is this strategic or applied-learning work?
              </legend>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink-800">
                <CheckboxField type="radio" name="qualifies_strategic" value="yes" label="Yes" />
                <CheckboxField type="radio" name="qualifies_strategic" value="no" label="No" />
                <CheckboxField
                  type="radio"
                  name="qualifies_strategic"
                  value=""
                  defaultChecked
                  label="Not sure
                  yet"
                />
              </div>
              <FieldHint>
                If yes, WUWF contributes the staff time and the partner pays for students and
                equipment — while WUWF has time set aside for it.
              </FieldHint>
            </fieldset>
          )}

          <div className="sm:col-span-2">
            <Label htmlFor="title">Name for this request</Label>
            <Input
              id="title"
              name="title"
              maxLength={TITLE_MAX}
              placeholder={
                anyTicked
                  ? "Optional — we'll name it from the service and partner"
                  : "Board of Trustees meeting webcast"
              }
              required={!anyTicked}
            />
          </div>
        </div>
      </Card>

      <details className="rounded border border-line bg-white">
        <summary className="cursor-pointer px-5 py-3.5 text-sm font-bold text-ink-900">
          More details
        </summary>
        <div className="grid grid-cols-1 gap-4 border-t border-line px-5 py-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="description">What is asked for</Label>
            <Textarea id="description" name="description" rows={3} />
          </div>
          <div>
            <Label htmlFor="requested">Asks for</Label>
            <Select id="requested" name="requested" defaultValue="production">
              <option value="production">Production</option>
              <option value="airtime">Airtime</option>
              <option value="both">Production and airtime</option>
            </Select>
            <FieldHint>Airtime is a commitment honored in Traffic or On Air.</FieldHint>
          </div>
          <div>
            <Label htmlFor="location">Location</Label>
            <Input id="location" name="location" maxLength={200} />
          </div>
          <div>
            <Label htmlFor="event_ends_on">Event ends</Label>
            <Input id="event_ends_on" name="event_ends_on" type="date" />
          </div>
          <div>
            <Label htmlFor="deliverables_due_on">Deliverables due</Label>
            <Input id="deliverables_due_on" name="deliverables_due_on" type="date" />
          </div>
          <div>
            <Label htmlFor="funding_index">Funding index</Label>
            <Input
              id="funding_index"
              name="funding_index"
              maxLength={60}
              placeholder={chosen?.defaultFundingIndex ?? ""}
            />
            <FieldHint>The partner&apos;s default is used when blank.</FieldHint>
          </div>
          <div>
            <Label htmlFor="editorial_review">Editorial review</Label>
            <Select id="editorial_review" name="editorial_review" defaultValue="not_needed">
              <option value="not_needed">Not needed</option>
              <option value="needed">Needed</option>
              <option value="cleared">Cleared</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="contact_name">Contact</Label>
            <Input
              id="contact_name"
              name="contact_name"
              maxLength={160}
              placeholder={chosen?.contactName ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="contact_email">Contact email</Label>
            <Input
              id="contact_email"
              name="contact_email"
              type="email"
              maxLength={160}
              placeholder={chosen?.contactEmail ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="contact_phone">Contact phone</Label>
            <Input id="contact_phone" name="contact_phone" maxLength={40} />
          </div>
        </div>
      </details>

      <div className="flex items-center gap-4">
        <Button type="submit">
          {anyTicked ? "Create and price the estimate" : "Create the request"}
        </Button>
        <TextLink href={cancelHref}>Cancel</TextLink>
      </div>
    </form>
  );
}
