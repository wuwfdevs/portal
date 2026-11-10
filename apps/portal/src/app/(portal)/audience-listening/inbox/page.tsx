import { requireToolAccess } from "@/lib/auth/authz";
import { listInboxPage } from "@/lib/audience-listening/inbox-queries";
import {
  INBOX_KIND_LABEL,
  INBOX_STATES,
  INBOX_STATE_BADGE,
  MAX_INTERNAL_NOTES_LENGTH,
  inboxMatches,
  parseInboxFilter,
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
import { redirect } from "next/navigation";
import { ListeningNav } from "../listening-nav";
import { deleteInboxItem, updateInboxItem } from "../actions";
import { INBOX_PAGE_SIZE } from "@/lib/audience-listening/inbox-queries";

const PATH = "/audience-listening/inbox";

export default async function AskWuwfPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; page?: string; error?: string }>;
}) {
  await requireToolAccess("audience-listening");
  const params = await searchParams;
  const filter = parseInboxFilter(params.show);
  const page = parsePage(params.page);
  const { rows, total, counts } = await listInboxPage(filter, page);
  const info = pageInfo(page, total, INBOX_PAGE_SIZE);
  const listParams = { show: filter === "open" ? null : filter };
  if (isPastLastPage(info)) redirect(pageHref(PATH, listParams, info.pageCount));

  const all = INBOX_STATES.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
  const open = INBOX_STATES.filter((s) => inboxMatches(s, "open")).reduce((sum, s) => sum + (counts[s] ?? 0), 0);
  const back = pageHref(PATH, listParams, page);

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader
        size="page"
        className="mb-6"
        title="Ask WUWF"
        description="Questions and story ideas sent from the website. A person reads every one. Nothing promises a reply or a date, so say so if you write back."
      />
      <ListeningNav current="inbox" />

      {params.error && <Alert className="mb-4">{params.error}</Alert>}

      <FilterChips
        label="Show"
        className="mb-4"
        chips={[
          { label: "Needs a person", count: open, href: pageHref(PATH, {}, 1), active: filter === "open" },
          ...INBOX_STATES.map((s) => ({
            label: INBOX_STATE_BADGE[s].label,
            count: counts[s] ?? 0,
            href: pageHref(PATH, { show: s }, 1),
            active: filter === s,
          })),
          { label: "All", count: all, href: pageHref(PATH, { show: "all" }, 1), active: filter === "all" },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState className="leading-relaxed">
          {filter === "open" ? "Nothing is waiting. New messages from the website appear here." : "Nothing in this view."}
        </EmptyState>
      ) : (
        <ul className="flex max-w-3xl flex-col gap-4">
          {rows.map((item) => {
            const badge = INBOX_STATE_BADGE[item.state];
            return (
              <li key={item.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    <Badge variant="neutral">{INBOX_KIND_LABEL[item.kind]}</Badge>
                    <span className="text-meta text-ink-400">{formatShortDateTime(item.created_at)}</span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-900">{item.body}</p>
                  <p className="mt-2 text-meta text-ink-500">
                    {item.email ? (
                      <>
                        Wants to hear what came of it:{" "}
                        <a className="break-all text-brand-hover underline" href={`mailto:${item.email}`}>
                          {item.email}
                        </a>
                      </>
                    ) : (
                      "No email left, so there is no one to write back to."
                    )}
                  </p>
                  <form action={updateInboxItem} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="back" value={back} />
                    <Field label="Where it stands" htmlFor={`state-${item.id}`}>
                      <Select id={`state-${item.id}`} name="state" defaultValue={item.state}>
                        {INBOX_STATES.map((s) => (
                          <option key={s} value={s}>
                            {INBOX_STATE_BADGE[s].label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Private note" htmlFor={`notes-${item.id}`} hint="Staff only. Never shown on the website.">
                      <Textarea id={`notes-${item.id}`} name="internal_notes" rows={2} maxLength={MAX_INTERNAL_NOTES_LENGTH} defaultValue={item.internal_notes ?? ""} />
                    </Field>
                    <FormActions>
                      <Button type="submit">Save</Button>
                    </FormActions>
                  </form>
                  <form action={deleteInboxItem} className="mt-3 border-t border-line pt-3">
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="back" value={back} />
                    <ConfirmSubmit
                      label="Delete"
                      confirmLabel="Yes, delete it"
                      message="This removes the message and any email left with it, for good. Use it for spam or anything that should not be kept."
                    />
                  </form>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination info={info} path={PATH} params={listParams} noun="messages" />
    </div>
  );
}
