import { redirect } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import { INBOX_PAGE_SIZE, listHostRequestsPage } from "@/lib/audience-listening/inbox-queries";
import {
  HOST_EXPECTED_LABEL,
  HOST_KIND_LABEL,
  HOST_REQUEST_STATES,
  HOST_REQUEST_STATE_BADGE,
  HOST_REQUEST_WARN_AFTER_DAYS,
  MAX_INTERNAL_NOTES_LENGTH,
  daysWaiting,
  hostRequestIsOverdue,
  hostRequestMatches,
  parseHostRequestFilter,
} from "@/lib/audience-listening/inboxes";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { FormActions } from "@/components/ui/form-actions";
import { Field, Select, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { formatShortDateTime } from "@/lib/format";
import { isPastLastPage, pageHref, pageInfo, parsePage } from "@/lib/pagination";
import { ListeningNav } from "../listening-nav";
import { deleteHostRequest, updateHostRequest } from "../actions";

const PATH = "/audience-listening/host-requests";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-36 shrink-0 text-meta font-semibold text-ink-500">{label}</dt>
      <dd className="min-w-0 whitespace-pre-wrap break-words text-sm text-ink-900">{children}</dd>
    </div>
  );
}

export default async function HostRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; page?: string; error?: string }>;
}) {
  await requireToolAccess("audience-listening");
  const params = await searchParams;
  const filter = parseHostRequestFilter(params.show);
  const page = parsePage(params.page);
  const { rows, total, counts } = await listHostRequestsPage(filter, page);
  const info = pageInfo(page, total, INBOX_PAGE_SIZE);
  const listParams = { show: filter === "open" ? null : filter };
  if (isPastLastPage(info)) redirect(pageHref(PATH, listParams, info.pageCount));

  const now = new Date();
  const all = HOST_REQUEST_STATES.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
  const open = HOST_REQUEST_STATES.filter((s) => hostRequestMatches(s, "open")).reduce((sum, s) => sum + (counts[s] ?? 0), 0);
  const overdue = rows.filter((r) => hostRequestIsOverdue(r, now)).length;
  const back = pageHref(PATH, listParams, page);

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader
        size="page"
        className="mb-6"
        title="Host requests"
        description="People who asked to bring a listening session to their table. The website tells them someone will write back within a week; the oldest wait at the top."
      />
      <ListeningNav current="host-requests" />

      {params.error && <Alert className="mb-4">{params.error}</Alert>}
      {overdue > 0 && (
        <Alert variant="warning" className="mb-4">
          {overdue === 1 ? "One request here has" : `${overdue} requests here have`} waited {HOST_REQUEST_WARN_AFTER_DAYS} days or more with no
          one picking {overdue === 1 ? "it" : "them"} up. The website promised an answer within a week.
        </Alert>
      )}

      <FilterChips
        label="Show"
        className="mb-4"
        chips={[
          { label: "Needs a person", count: open, href: pageHref(PATH, {}, 1), active: filter === "open" },
          ...HOST_REQUEST_STATES.map((s) => ({
            label: HOST_REQUEST_STATE_BADGE[s].label,
            count: counts[s] ?? 0,
            href: pageHref(PATH, { show: s }, 1),
            active: filter === s,
          })),
          { label: "All", count: all, href: pageHref(PATH, { show: "all" }, 1), active: filter === "all" },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState className="leading-relaxed">
          {filter === "open" ? "No requests are waiting. New ones from the website appear here." : "Nothing in this view."}
        </EmptyState>
      ) : (
        <ul className="flex max-w-3xl flex-col gap-4">
          {rows.map((request) => {
            const badge = HOST_REQUEST_STATE_BADGE[request.state];
            const isOverdue = hostRequestIsOverdue(request, now);
            const days = daysWaiting(request.created_at, now);
            return (
              <li key={request.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    {isOverdue && <Badge variant="danger">Waiting {days} days</Badge>}
                    <Badge variant="neutral">{HOST_KIND_LABEL[request.kind]}</Badge>
                    <span className="text-meta text-ink-400">{formatShortDateTime(request.created_at)}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-ink-900">
                    {request.name}
                    {request.organization ? `, ${request.organization}` : ""}
                  </p>
                  <dl className="mt-3 flex flex-col gap-2">
                    <Detail label="Email">
                      <a className="break-all text-brand-hover underline" href={`mailto:${request.email}`}>
                        {request.email}
                      </a>
                    </Detail>
                    <Detail label="When">{request.when_text}</Detail>
                    <Detail label="Where">{request.address}</Detail>
                    <Detail label="Seats">{request.seats}</Detail>
                    <Detail label="Expected">{HOST_EXPECTED_LABEL[request.expected]}</Detail>
                    {request.invitees_text && <Detail label="Would invite">{request.invitees_text}</Detail>}
                    <Detail label="WUWF journalist">{request.journalist_requested ? "Asked for one to join" : "Not asked for"}</Detail>
                  </dl>
                  <form action={updateHostRequest} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
                    <input type="hidden" name="id" value={request.id} />
                    <input type="hidden" name="back" value={back} />
                    <Field label="Where it stands" htmlFor={`state-${request.id}`}>
                      <Select id={`state-${request.id}`} name="state" defaultValue={request.state}>
                        {HOST_REQUEST_STATES.map((s) => (
                          <option key={s} value={s}>
                            {HOST_REQUEST_STATE_BADGE[s].label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Private note" htmlFor={`notes-${request.id}`} hint="Staff only. Never shown on the website.">
                      <Textarea id={`notes-${request.id}`} name="internal_notes" rows={2} maxLength={MAX_INTERNAL_NOTES_LENGTH} defaultValue={request.internal_notes ?? ""} />
                    </Field>
                    <FormActions>
                      <Button type="submit">Save</Button>
                    </FormActions>
                  </form>
                  <form action={deleteHostRequest} className="mt-3 border-t border-line pt-3">
                    <input type="hidden" name="id" value={request.id} />
                    <input type="hidden" name="back" value={back} />
                    <ConfirmSubmit
                      label="Delete"
                      confirmLabel="Yes, delete it"
                      message="This removes the request, with the name and email on it, for good."
                    />
                  </form>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination info={info} path={PATH} params={listParams} noun="requests" />
    </div>
  );
}
