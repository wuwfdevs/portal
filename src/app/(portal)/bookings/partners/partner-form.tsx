import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { PARTNER_NAME_MAX } from "@/lib/bookings/agreements";
import { PARTNER_KIND_LABEL } from "@/lib/bookings/projects";
import type { BkPartnerRow } from "@/lib/bookings/queries";
import { TextLink } from "@/components/ui/primary-link";

/**
 * The one partner form, shared by /partners/new and /partners/[id]/edit
 * (docs/ui-patterns.md rule 3). The error from `?error=` renders inside it.
 */
export function PartnerForm({
  action,
  partner,
  submitLabel,
  cancelHref,
  error,
}: {
  action: (formData: FormData) => void | Promise<void>;
  partner?: BkPartnerRow;
  submitLabel: string;
  cancelHref: string;
  error?: string;
}) {
  return (
    <form action={action} className="flex w-full max-w-2xl flex-col gap-5">
      {error && <Alert>{error}</Alert>}
      {partner && <input type="hidden" name="partner_id" value={partner.id} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            required
            maxLength={PARTNER_NAME_MAX}
            defaultValue={partner?.name ?? ""}
            placeholder="Office of Undergraduate Research"
            autoFocus={!partner}
          />
        </div>
        <div>
          <Label htmlFor="kind">The partner is</Label>
          <Select id="kind" name="kind" defaultValue={partner?.kind ?? "uwf_unit"}>
            <option value="uwf_unit">{PARTNER_KIND_LABEL.uwf_unit}</option>
            <option value="external">{PARTNER_KIND_LABEL.external}</option>
          </Select>
          <FieldHint>
            An outside partner&apos;s requests are priced external: full cost, the assessment and
            the margin.
          </FieldHint>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="contact_name">Contact</Label>
          <Input
            id="contact_name"
            name="contact_name"
            maxLength={160}
            defaultValue={partner?.contact_name ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="contact_email">Email</Label>
          <Input
            id="contact_email"
            name="contact_email"
            type="email"
            maxLength={200}
            defaultValue={partner?.contact_email ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="contact_phone">Phone</Label>
          <Input
            id="contact_phone"
            name="contact_phone"
            maxLength={40}
            defaultValue={partner?.contact_phone ?? ""}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="default_funding_index">Funding index</Label>
          <Input
            id="default_funding_index"
            name="default_funding_index"
            maxLength={60}
            defaultValue={partner?.default_funding_index ?? ""}
          />
          <FieldHint>Where a recharge goes unless a request says otherwise.</FieldHint>
        </div>
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={partner?.notes ?? ""} />
      </div>
      <div className="flex items-center gap-4">
        <Button type="submit">{submitLabel}</Button>
        <TextLink href={cancelHref}>Cancel</TextLink>
      </div>
    </form>
  );
}
