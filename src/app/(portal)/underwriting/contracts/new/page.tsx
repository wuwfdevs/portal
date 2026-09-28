import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { listIndustryCategories, listUnderwriters } from "@/lib/underwriting/queries";
import { createContract } from "../../contract-actions";
import { createContractFromAgreement } from "../../agreement-import-actions";
import { WizardHeader } from "../[id]/wizard-header";

// Creating from the agreement (§12) sends the upload through the model,
// which can run past a Server Action's default budget; raised here, on the
// page, the same way the program-log import page does it — never in the
// actions file itself (see CLAUDE.md's Sourcework Phase 3b note).
export const maxDuration = 300;

/**
 * Step 1 of contract setup: the order itself (docs/underwriting-traffic-
 * redesign.md §11). Creates the contract as a draft with its first revision
 * and continues to the schedule step; nothing schedules until step 4
 * activates it. The traffic-policy fields the old inline form asked here
 * moved to step 3, where they sit beside the copy they govern.
 *
 * The same form has two ways out (docs/underwriting-traffic-redesign.md
 * §12): "Continue to schedule" with the fields typed by hand, or "Create
 * from the agreement" with the signed document chosen — the model reads
 * it, whatever was typed wins over the reading, and every line that
 * compiles lands on the schedule step as an ordinary draft line. The
 * second button skips the browser's required-field checks (formNoValidate)
 * because the document supplies what was left blank; the action refuses a
 * reading that leaves the underwriter or the start date unknown.
 */
export default async function NewContractPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; underwriter?: string }>;
}) {
  const { error, underwriter: preselectedUnderwriterId } = await searchParams;
  const [underwriters, categories] = await Promise.all([
    listUnderwriters(),
    listIndustryCategories(),
  ]);
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));

  return (
    <div>
      <WizardHeader contract={null} current={0} />
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <form action={createContract} className="flex w-full max-w-2xl flex-col gap-5">
          {error && <Alert>{error}</Alert>}
          <div>
            <Label htmlFor="underwriter_id">Underwriter</Label>
            {underwriters.length === 0 ? (
              <p className="text-xs text-ink-500">
                No underwriters yet —{" "}
                <Link
                  href="/underwriting/underwriters/new"
                  className="font-semibold text-brand-link"
                >
                  add one first
                </Link>
                .
              </p>
            ) : (
              <SearchableSelect
                id="underwriter_id"
                name="underwriter_id"
                required
                placeholder="Type the underwriter's name…"
                defaultValue={
                  underwriters.some((underwriter) => underwriter.id === preselectedUnderwriterId)
                    ? preselectedUnderwriterId
                    : undefined
                }
                options={underwriters.map((underwriter) => ({
                  id: underwriter.id,
                  label: underwriter.name,
                  hint:
                    underwriter.category_id && categoryNameById.has(underwriter.category_id)
                      ? categoryNameById.get(underwriter.category_id)
                      : undefined,
                }))}
                emptyMessage="No underwriter by that name — add one below."
              />
            )}
            <FieldHint>
              Not listed?{" "}
              <Link href="/underwriting/underwriters/new" className="font-semibold text-brand-link">
                Add an underwriter
              </Link>{" "}
              and come back — the industry on the underwriter is what the adjacency rule reads.
            </FieldHint>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="contract_identifier">Order or insertion order number</Label>
              <Input id="contract_identifier" name="contract_identifier" required maxLength={120} />
            </div>
            <div>
              <Label htmlFor="sponsorship_total">Sponsorship total ($)</Label>
              <Input
                id="sponsorship_total"
                name="sponsorship_total"
                type="number"
                step="0.01"
                min={0}
                inputMode="decimal"
              />
            </div>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-ink-700">Runs</legend>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="effective_from" className="font-normal text-ink-500">
                  From
                </Label>
                <Input id="effective_from" name="effective_from" type="date" required />
              </div>
              <div>
                <Label htmlFor="effective_to" className="font-normal text-ink-500">
                  To
                </Label>
                <Input id="effective_to" name="effective_to" type="date" />
              </div>
            </div>
            <FieldHint>
              Every schedule line starts from these dates; each one can narrow them.
            </FieldHint>
          </fieldset>

          <div>
            <Label htmlFor="sponsorship_category">Sponsorship category</Label>
            <Input
              id="sponsorship_category"
              name="sponsorship_category"
              placeholder="As the order names it"
            />
            <FieldHint>
              What this order sponsors, in the order&apos;s words. The underwriter&apos;s industry
              is set on the underwriter, not here.
            </FieldHint>
          </div>

          <div>
            <Label htmlFor="account_rep">Account rep</Label>
            <Input id="account_rep" name="account_rep" />
            <FieldHint>
              The station&apos;s salesperson on this order. Printed on its affidavits.
            </FieldHint>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Anything about this order the schedule lines will not capture"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <Button type="submit">Continue to schedule</Button>
            <span className="text-xs text-ink-500">
              With the fields above as typed. The signed order can be attached on the review step
              once the contract exists.
            </span>
          </div>

          <div className="rounded border border-line bg-panel-50 px-5 py-4">
            <Label htmlFor="agreement_file">Or start from the signed agreement</Label>
            <Input
              id="agreement_file"
              name="agreement_file"
              type="file"
              accept="application/pdf,image/png,image/jpeg"
            />
            <FieldHint>
              Upload the signed order or agreement (PDF, or a photo as PNG/JPEG) and it is read into
              the order&apos;s facts and its schedule lines for you to review. Anything typed above
              takes precedence over the reading; leave blank whatever the document should fill. The
              underwriter must already be on file.
            </FieldHint>
            <div className="mt-3">
              <Button
                type="submit"
                variant="secondary"
                formAction={createContractFromAgreement}
                formNoValidate
              >
                Create from the agreement
              </Button>
            </div>
          </div>
        </form>

        <aside
          aria-label="About drafts"
          className="w-full shrink-0 rounded border border-line bg-panel-50 px-5 py-4 lg:w-80"
        >
          <div className="text-[13px] font-bold text-ink-900">Saved as a draft as you go</div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-700">
            Nothing schedules until the contract is activated in step 4. You can leave and come back
            to it from the Contracts list; the traffic policy and copy come in step 3.
          </p>
        </aside>
      </div>
    </div>
  );
}
