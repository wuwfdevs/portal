import Link from "next/link";
import { redirect } from "next/navigation";
import { requireEditorialAccess } from "@/lib/editorial/access";
import { listMeetingsWithStats, type MeetingListEntry } from "@/lib/editorial/data";
import { formatDate } from "@/lib/editorial/format";
import { isPastLastPage, pageHref, pageInfo, pageRange, parsePage } from "@/lib/pagination";
import { pluralize } from "@/lib/format";
import { MeetingStatusBadge } from "@/components/editorial/outcome-badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { createMeeting } from "./actions";

const MEETINGS_PATH = "/editorial/meetings";
type MeetingsView = "all" | "current" | "concluded";

/**
 * The meetings list (docs/ui-patterns.md): a toolbar with a status filter and
 * "+ New meeting" (editors), which opens an inline create card — a meeting is
 * one field — over a stacking table with pages. Each row says what the reader
 * would ask of it: an open meeting, how much of it they have scored; one on
 * its agenda, how many decisions are left; a concluded one, the outcomes.
 */
export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; view?: string; new?: string; page?: string }>;
}) {
  const { profile, role } = await requireEditorialAccess();
  const { error, view: viewParam, new: newParam, page: pageParam } = await searchParams;
  const view: MeetingsView =
    viewParam === "current" || viewParam === "concluded" ? viewParam : "all";
  const creating = newParam === "1" && role === "editor";

  const all = await listMeetingsWithStats(profile.id);
  const rows = all.filter(({ meeting }) =>
    view === "all"
      ? true
      : view === "concluded"
        ? meeting.status === "concluded"
        : meeting.status !== "concluded",
  );
  const page = parsePage(pageParam);
  const info = pageInfo(page, rows.length);
  const query = { view: view === "all" ? null : view };
  if (isPastLastPage(info)) redirect(pageHref(MEETINGS_PATH, query, info.pageCount));
  const { from, to } = pageRange(page);
  const pageRows = rows.slice(from, to + 1);

  const hrefFor = (key: MeetingsView) =>
    pageHref(MEETINGS_PATH, { view: key === "all" ? null : key }, 1);
  const countFor = (key: MeetingsView) =>
    key === "all"
      ? all.length
      : all.filter(({ meeting }) =>
          key === "concluded" ? meeting.status === "concluded" : meeting.status !== "concluded",
        ).length;

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar
        chipsLabel="Meetings"
        chips={[
          { label: "All", href: hrefFor("all"), active: view === "all", count: countFor("all") },
          {
            label: "In progress",
            href: hrefFor("current"),
            active: view === "current",
            count: countFor("current"),
          },
          {
            label: "Concluded",
            href: hrefFor("concluded"),
            active: view === "concluded",
            count: countFor("concluded"),
          },
        ]}
        primary={
          role === "editor" && !creating
            ? { href: `${MEETINGS_PATH}?new=1`, label: "New meeting" }
            : null
        }
      />

      {error && !creating && <Alert>{error}</Alert>}

      {creating && (
        <InlineCreateCard
          title="New meeting"
          action={createMeeting}
          submitLabel="Create meeting"
          cancelHref={MEETINGS_PATH}
        >
          {error && <Alert className="mb-4">{error}</Alert>}
          <Field
            label="Meeting date"
            htmlFor="meeting_date"
            hint="It opens for slate building and independent scoring against the rubric in Settings. Nobody sees anyone else's scores until you close scoring."
          >
            <Input id="meeting_date" name="meeting_date" type="date" required className="w-44" />
          </Field>
        </InlineCreateCard>
      )}

      {rows.length === 0 ? (
        <EmptyState className="leading-relaxed">
          {all.length === 0 ? (
            <>
              No meetings yet.{" "}
              {role === "editor"
                ? "Create one and pick a slate from the backlog."
                : "An editor will create the first one."}
            </>
          ) : (
            "No meetings in this view."
          )}
        </EmptyState>
      ) : (
        <TableFrame>
          <Table stack>
            <thead>
              <HeaderRow>
                <Th>Meeting</Th>
                <Th>Status</Th>
                <Th className="text-right">Slate</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {pageRows.map((entry) => (
                <Row key={entry.meeting.id}>
                  <Cell stack="title">
                    <Link
                      href={`${MEETINGS_PATH}/${entry.meeting.id}`}
                      className="font-serif text-body font-bold text-ink-900 hover:text-brand-link hover:underline"
                    >
                      {formatDate(entry.meeting.meeting_date)}
                    </Link>
                  </Cell>
                  <Cell stack="aside">
                    <MeetingStatusBadge status={entry.meeting.status} />
                  </Cell>
                  <Cell label="Slate" className="text-ui text-ink-500 md:text-right">
                    <SlateLine entry={entry} canScore={role !== "contributor"} />
                  </Cell>
                </Row>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}

      <Pagination info={info} path={MEETINGS_PATH} params={query} noun="meetings" />
    </div>
  );
}

function SlateLine({ entry, canScore }: { entry: MeetingListEntry; canScore: boolean }) {
  const { meeting, total, decided, assigned, deferred, archived, scoredByMe } = entry;
  if (total === 0) return <>Empty</>;
  const size = pluralize(total, "pitch", "pitches");
  if (meeting.status === "open") {
    return (
      <>
        <span className="text-ink-700">{size}</span>
        {canScore && (
          <span className="block">
            {scoredByMe >= total
              ? "You have scored all of them"
              : `You have scored ${scoredByMe} of ${total}`}
          </span>
        )}
      </>
    );
  }
  if (meeting.status === "agenda") {
    return (
      <>
        <span className="text-ink-700">{size}</span>
        <span className="block">
          {decided} decided · {total - decided} to go
        </span>
      </>
    );
  }
  const parts = [
    assigned > 0 ? `${assigned} assigned` : null,
    deferred > 0 ? `${deferred} deferred` : null,
    archived > 0 ? `${archived} archived` : null,
  ].filter((part): part is string => part !== null);
  return (
    <>
      <span className="text-ink-700">{size}</span>
      {parts.length > 0 && <span className="block">{parts.join(" · ")}</span>}
    </>
  );
}
