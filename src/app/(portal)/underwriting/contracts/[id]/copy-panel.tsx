import { orderNumberLabel } from "@/lib/underwriting/contract-label";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { FieldHint, Label, Select } from "@/components/ui/input";
import { PrimaryLink } from "@/components/ui/primary-link";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import type { UwCopyApprovalStatus } from "@/lib/database.types";
import { estimateReadSeconds, countWords } from "@/lib/log/read-time";
import { formatPlacementTime } from "@/lib/underwriting/placement";
import {
  getContractCopyContext,
  listCopyUsageForContract,
  type ContractDetail,
  type CopyUsage,
  type LinkableCopyOption,
  type UwCopyRow,
} from "@/lib/underwriting/queries";
import { linkCopyToContract, setCopyFlight, unlinkCopyFromContract } from "../../contract-actions";
import { createCopy, setCopyStatus, updateCopyDetails } from "../../copy-actions";
import { CopyFormFields } from "../../copy/copy-form";
import { LineActions } from "./line-actions";

const APPROVAL_VARIANT: Record<UwCopyApprovalStatus, BadgeVariant> = {
  draft: "warning",
  approved: "success",
  expired: "muted",
  retired: "muted",
};

export interface CopyPanelParams {
  new?: string;
  link?: string;
  edit?: string;
  error?: string;
}

/**
 * A contract's messages, as one panel shared by the setup wizard's copy
 * step and the contract page's Copy tab (docs/underwriting-traffic-
 * redesign.md §13): a heading row with "Link existing…" and "+ New
 * message", then one card per linked message with its script in full
 * and Edit / Approve / Unlink acting in place. `?new=1`, `?link=1` and
 * `?edit=<id>` open the inline cards (docs/ui-patterns.md — no client
 * state for opening and closing); a failed submit lands back on the same
 * URL with `&error=` so the message renders inside the card that raised
 * it. Every write here re-sequences the contract's rotation afterwards.
 */
export async function ContractCopyPanel({
  contract,
  surface,
  params,
}: {
  contract: ContractDetail;
  /** The wizard step (returns to /copy) or the contract page's Copy tab. */
  surface: "step" | "tab";
  params: CopyPanelParams;
}) {
  const base = `/underwriting/contracts/${contract.id}`;
  const pagePath = surface === "step" ? `${base}/copy` : `${base}?tab=copy`;
  const withQuery = (query: string) => `${pagePath}${pagePath.includes("?") ? "&" : "?"}${query}`;
  const returnTo = surface === "step" ? "copy" : "tab";

  const [context, usage] = await Promise.all([
    getContractCopyContext(contract),
    surface === "tab" ? listCopyUsageForContract(contract) : Promise.resolve(null),
  ]);
  const flightByCopy = new Map(contract.copyLinks.map((link) => [link.copy_id, link.flight_id]));
  const flightNameById = new Map(contract.flights.map((flight) => [flight.id, flight.name]));
  const approved = contract.copy.filter((item) => item.approval_status === "approved").length;
  const awaiting = contract.copy.filter((item) => item.approval_status === "draft").length;

  const openCard = params.new ? "new" : params.link ? "link" : params.edit ? "edit" : null;
  const errorInCard = params.error && openCard ? params.error : null;

  const toOption = ({ copy, linkedTo }: LinkableCopyOption): SearchableOption => ({
    id: copy.id,
    label: copy.label,
    hint: [
      copy.approval_status,
      copy.execution_kind === "live_read" ? "live read" : "recorded",
      copy.duration_seconds != null ? `${copy.duration_seconds}s` : null,
      linkedTo[0]
        ? `${orderNumberLabel(linkedTo[0].contractIdentifier)}${linkedTo[0].effectiveTo ? ` (to ${linkedTo[0].effectiveTo})` : ""}`
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
    detail: copy.script ? copy.script.slice(0, 110) : undefined,
  });

  return (
    <div className="flex flex-col gap-4">
      {params.error && !openCard && <Alert>{params.error}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
          {surface === "tab"
            ? `Messages in rotation · ${approved} approved`
            : `Messages · ${contract.copy.length} linked${awaiting > 0 ? ` · ${awaiting} awaiting approval` : ""}`}
        </h3>
        <span className="flex-1" />
        <Link
          href={withQuery("link=1")}
          className="inline-flex items-center justify-center rounded border border-brand-link px-3 py-2 text-[13px] font-bold text-brand-link hover:bg-brand-surface"
        >
          Link existing…
        </Link>
        <PrimaryLink href={withQuery("new=1")} className="px-3 py-2 text-[13px]">
          + New message
        </PrimaryLink>
      </div>

      {openCard === "new" && (
        <InlineCreateCard
          title={`New message for ${contract.underwriter.name}`}
          action={createCopy}
          submitLabel="Create and link"
          cancelHref={pagePath}
          sections={
            <div className="border-t border-line px-5 py-3">
              <label className="flex items-start gap-2 text-sm text-ink-700">
                <input type="checkbox" name="approve_now" className="mt-0.5 h-4 w-4" />
                <span>
                  <span className="font-semibold">Approved — ready to place</span>
                  <span className="mt-0.5 block text-xs leading-snug text-ink-400">
                    Tick this when the sponsor has already signed off on the wording, as it usually
                    has by the time an order is entered. Left off, the message is a draft and
                    nothing places it until someone approves it.
                  </span>
                </span>
              </label>
            </div>
          }
        >
          {errorInCard && (
            <div className="mb-4">
              <Alert>{errorInCard}</Alert>
            </div>
          )}
          <input type="hidden" name="contract_id" value={contract.id} />
          <input type="hidden" name="return_to" value={returnTo} />
          <CopyFormFields idPrefix="new" effectiveFromDefault={contract.effective_from} />
        </InlineCreateCard>
      )}

      {openCard === "link" && (
        <InlineCreateCard
          title="Link a message already on file"
          action={linkCopyToContract}
          submitLabel="Link to this contract"
          cancelHref={pagePath}
        >
          {errorInCard && (
            <div className="mb-4">
              <Alert>{errorInCard}</Alert>
            </div>
          )}
          <input type="hidden" name="contract_id" value={contract.id} />
          <input type="hidden" name="return_to" value={returnTo} />
          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="link_copy_id">Message</Label>
              <SearchableSelect
                id="link_copy_id"
                name="copy_id"
                required
                placeholder="Type a label, a phrase from the script, or an underwriter"
                options={context.linkablePrimary.map(toOption)}
                groups={{
                  primaryLabel: `${contract.underwriter.name} · ${context.linkablePrimary.length} valid for this contract's dates`,
                  secondaryOptions: context.linkableSecondary.map(toOption),
                  secondaryLabel: "Other messages",
                  secondaryHint:
                    context.linkableSecondary.length > 0
                      ? `${context.linkableSecondary.length} other message${context.linkableSecondary.length === 1 ? "" : "s"} on file — other underwriters', or this one's expired or retired copy. They appear once your search matches one.`
                      : undefined,
                }}
                emptyMessage="No message on file matches — write a new one instead."
              />
              <FieldHint>
                Linking is not copying: the same row serves every contract it&apos;s linked to, and
                an edit changes the words everywhere. Retired or expired copy can be linked but
                never places.
              </FieldHint>
            </div>
            {contract.flights.length > 0 && (
              <div className="sm:w-1/2">
                <Label htmlFor="link_flight_id">Serves</Label>
                <Select id="link_flight_id" name="flight_id" defaultValue="">
                  <option value="">Whole contract</option>
                  {contract.flights.map((flight) => (
                    <option key={flight.id} value={flight.id}>
                      {flight.name}
                    </option>
                  ))}
                </Select>
                <FieldHint>
                  Scope a message to one flight when the order groups its dates and copy by event.
                </FieldHint>
              </div>
            )}
          </div>
        </InlineCreateCard>
      )}

      {contract.copy.length === 0 && openCard !== "new" && (
        <div className="rounded border border-dashed border-line px-5 py-6 text-sm text-ink-500">
          No messages yet. A contract needs at least one approved message before anything places —
          write the first one, or link one of {contract.underwriter.name}&apos;s from a previous
          order.
        </div>
      )}

      {contract.copy.map((item) =>
        openCard === "edit" && params.edit === item.id ? (
          <InlineCreateCard
            key={item.id}
            title={`Editing ${item.label}`}
            action={updateCopyDetails}
            submitLabel="Save changes"
            cancelHref={pagePath}
            sections={
              <div className="flex flex-wrap items-center gap-3 border-t border-line bg-panel-50 px-5 py-3 text-[13px] text-ink-700">
                <span className="min-w-0 flex-1">
                  {(context.otherContractsByCopy.get(item.id) ?? []).length === 0 ? (
                    <>
                      This message is only linked to this contract. A message shared with other
                      orders would be named here, since one edit changes the words everywhere it
                      airs.
                    </>
                  ) : (
                    <>
                      Also linked to{" "}
                      {(context.otherContractsByCopy.get(item.id) ?? []).map((other, index) => (
                        <span key={other.id}>
                          {index > 0 && ", "}
                          <Link
                            href={`/underwriting/contracts/${other.id}?tab=copy`}
                            className="font-semibold text-brand-link"
                          >
                            {orderNumberLabel(other.contractIdentifier)}
                          </Link>{" "}
                          ({other.underwriterName})
                        </span>
                      ))}{" "}
                      — the change applies there too.
                    </>
                  )}
                </span>
                <Link
                  href={`/underwriting/copy/${item.id}`}
                  className="shrink-0 font-semibold text-brand-link"
                >
                  Open in copy library ↗
                </Link>
              </div>
            }
          >
            {errorInCard && (
              <div className="mb-4">
                <Alert>{errorInCard}</Alert>
              </div>
            )}
            <input type="hidden" name="copy_id" value={item.id} />
            <input type="hidden" name="contract_id" value={contract.id} />
            <input type="hidden" name="return_to" value={returnTo} />
            <CopyFormFields idPrefix={`edit_${item.id}`} defaults={item} />
          </InlineCreateCard>
        ) : (
          <CopyCard
            key={item.id}
            item={item}
            contract={contract}
            editHref={withQuery(`edit=${item.id}`)}
            returnTo={returnTo}
            flightId={flightByCopy.get(item.id) ?? null}
            flightNameById={flightNameById}
            usage={usage?.get(item.id) ?? null}
          />
        ),
      )}

      <p className="text-xs text-ink-500">
        Auto-fill and manual placement rotate approved messages in order across every line of this
        contract. A message effective for part of the run only rotates on the dates it covers.
      </p>
    </div>
  );
}

function describeDuration(item: UwCopyRow): string {
  if (item.duration_seconds == null) return "no duration yet";
  if (item.execution_kind === "recorded") return `${item.duration_seconds}s`;
  const estimate = estimateReadSeconds(item.script);
  return estimate === item.duration_seconds
    ? `~${item.duration_seconds}s estimated from ${countWords(item.script ?? "")} words`
    : `${item.duration_seconds}s timed`;
}

function CopyCard({
  item,
  contract,
  editHref,
  returnTo,
  flightId,
  flightNameById,
  usage,
}: {
  item: UwCopyRow;
  contract: ContractDetail;
  editHref: string;
  returnTo: string;
  flightId: string | null;
  flightNameById: Map<string, string>;
  usage: CopyUsage | null;
}) {
  const isDraft = item.approval_status === "draft";
  const meta = [
    item.execution_kind === "live_read" ? "Live read" : "Recorded",
    describeDuration(item),
    `effective ${item.effective_from}${item.effective_to ? ` – ${item.effective_to}` : " onward"}`,
    item.cart_identifier ? `cart ${item.cart_identifier}` : null,
    flightId ? `serves ${flightNameById.get(flightId) ?? "one flight"}` : null,
    usage
      ? `scheduled ${usage.scheduled} · aired ${usage.aired}${usage.nextScheduledAt ? ` · next ${formatPlacementTime(usage.nextScheduledAt)}` : ""}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const panels = [
    {
      key: "status",
      label: "Change status…",
      content: (
        <form action={setCopyStatus} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="copy_id" value={item.id} />
          <input type="hidden" name="contract_id" value={contract.id} />
          <input type="hidden" name="return_to" value={returnTo} />
          <div className="w-full sm:w-56">
            <Label htmlFor={`status_${item.id}`}>Approval status</Label>
            <Select
              id={`status_${item.id}`}
              name="approval_status"
              defaultValue={item.approval_status}
            >
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="expired">Expired</option>
              <option value="retired">Retired</option>
            </Select>
            <FieldHint>
              Only an approved message rotates; expired or retired copy stays on the credits it
              already has.
            </FieldHint>
          </div>
          <Button type="submit" variant="secondary">
            Update status
          </Button>
        </form>
      ),
    },
    ...(contract.flights.length > 0
      ? [
          {
            key: "flight",
            label: "Serve one flight only…",
            content: (
              <form action={setCopyFlight} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="copy_id" value={item.id} />
                <input type="hidden" name="contract_id" value={contract.id} />
                <input type="hidden" name="return_to" value={returnTo} />
                <div className="w-full sm:w-56">
                  <Label htmlFor={`flight_${item.id}`}>Serves</Label>
                  <Select id={`flight_${item.id}`} name="flight_id" defaultValue={flightId ?? ""}>
                    <option value="">Whole contract</option>
                    {contract.flights.map((flight) => (
                      <option key={flight.id} value={flight.id}>
                        {flight.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button type="submit" variant="secondary">
                  Set flight
                </Button>
              </form>
            ),
          },
        ]
      : []),
  ];

  return (
    <article
      aria-labelledby={`copy_${item.id}`}
      className={`rounded border bg-white ${isDraft ? "border-warning-border" : "border-line"}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-5 py-3.5">
        <span id={`copy_${item.id}`} className="text-sm font-bold text-ink-900">
          {item.label}
        </span>
        <Badge variant={APPROVAL_VARIANT[item.approval_status]}>{item.approval_status}</Badge>
        <span className="text-[13px] text-ink-500">{meta}</span>
        <span className="flex-1" />
        <Link
          href={editHref}
          className="px-1 text-[13px] font-bold text-brand-link hover:underline"
        >
          Edit
        </Link>
        <Link
          href={`/underwriting/copy/${item.id}`}
          className="px-1 text-[13px] font-bold text-brand-link hover:underline"
        >
          Library
        </Link>
        <form action={unlinkCopyFromContract}>
          <input type="hidden" name="contract_id" value={contract.id} />
          <input type="hidden" name="copy_id" value={item.id} />
          <input type="hidden" name="return_to" value={returnTo} />
          <Button type="submit" variant="ghost" className="text-[13px]">
            Unlink
          </Button>
        </form>
        <LineActions label={`More actions for ${item.label}`} panels={panels} />
      </div>
      {item.script ? (
        <p className="whitespace-pre-line px-5 py-4 text-sm leading-relaxed text-ink-900">
          {item.script}
        </p>
      ) : (
        <p className="px-5 py-4 text-sm text-ink-500">No script recorded.</p>
      )}
      {isDraft && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-warning-bg px-5 py-3">
          <span className="min-w-0 flex-1 text-[13px] text-warning-fg">
            Not yet approved — auto-fill and manual placement skip it until it is. Approve once the
            sponsor has signed off on the wording.
          </span>
          <form action={setCopyStatus}>
            <input type="hidden" name="copy_id" value={item.id} />
            <input type="hidden" name="contract_id" value={contract.id} />
            <input type="hidden" name="return_to" value={returnTo} />
            <input type="hidden" name="approval_status" value="approved" />
            <Button type="submit" className="px-3 py-2 text-[13px]">
              Approve
            </Button>
          </form>
        </div>
      )}
    </article>
  );
}
