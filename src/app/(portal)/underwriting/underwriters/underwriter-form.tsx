import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import type { UwIndustryCategoryRow, UwUnderwriterRow } from "@/lib/underwriting/queries";
import { TextLink } from "@/components/ui/primary-link";

export type UnderwriterFormDefaults = Pick<
  UwUnderwriterRow,
  "name" | "mailing_address" | "contact_name" | "phone" | "email" | "category_id" | "notes"
>;

/**
 * The one underwriter form, shared by /underwriters/new and
 * /underwriters/[id]/edit (docs/ui-patterns.md rule 3: edit uses the same
 * form as create). A server component: the page passes the action and the
 * record's current values; the error from `?error=` renders inside the form.
 */
export function UnderwriterForm({
  action,
  defaults,
  submitLabel,
  cancelHref,
  categories,
  error,
  hiddenFields,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaults?: UnderwriterFormDefaults;
  submitLabel: string;
  cancelHref: string;
  categories: UwIndustryCategoryRow[];
  error?: string;
  hiddenFields?: Record<string, string>;
}) {
  const categoryOptions = categories.filter(
    (category) => category.active || category.id === defaults?.category_id,
  );

  return (
    <form action={action} className="flex w-full max-w-2xl flex-col gap-5">
      {error && <Alert>{error}</Alert>}
      {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div>
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={200}
          defaultValue={defaults?.name ?? ""}
          autoFocus
        />
      </div>
      <div>
        <Label htmlFor="mailing_address">Mailing address</Label>
        <Textarea
          id="mailing_address"
          name="mailing_address"
          rows={2}
          defaultValue={defaults?.mailing_address ?? ""}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="contact_name">Contact name</Label>
          <Input
            id="contact_name"
            name="contact_name"
            maxLength={200}
            defaultValue={defaults?.contact_name ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" maxLength={40} defaultValue={defaults?.phone ?? ""} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={defaults?.email ?? ""} />
        </div>
      </div>
      <div>
        <Label htmlFor="category_id">Industry</Label>
        <Select id="category_id" name="category_id" defaultValue={defaults?.category_id ?? ""}>
          <option value="">None</option>
          {categoryOptions.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <FieldHint>
          Used for the competitive-adjacency rule when scheduling credits. Missing one?{" "}
          <TextLink href="/underwriting/setup/industries">Manage industries</TextLink>.
        </FieldHint>
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={defaults?.notes ?? ""} />
      </div>
      <div className="flex items-center gap-4 border-t border-line pt-5">
        <Button type="submit">{submitLabel}</Button>
        <TextLink href={cancelHref}>Cancel</TextLink>
      </div>
    </form>
  );
}
