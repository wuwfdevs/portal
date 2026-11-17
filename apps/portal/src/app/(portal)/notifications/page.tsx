import Link from "next/link";
import { requireActiveProfile } from "@/lib/auth/authz";
import { listNotifications } from "@/lib/notifications/queries";
import { getNotificationType } from "@/lib/notifications/catalog";
import { DEFAULT_PAGE_SIZE, pageInfo, pageHref, parsePage, isPastLastPage } from "@/lib/pagination";
import { formatShortDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { SecondaryLink } from "@/components/ui/primary-link";
import { markAllNotificationsRead, openNotification } from "./actions";
import { redirect } from "next/navigation";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; error?: string }>;
}) {
  const params = await searchParams;
  const profile = await requireActiveProfile();
  const page = parsePage(params.page);
  const { rows, total } = await listNotifications(profile.id, page);
  const info = pageInfo(page, total, DEFAULT_PAGE_SIZE);
  if (isPastLastPage(info)) redirect(pageHref("/notifications", {}, info.pageCount));
  const anyUnread = rows.some((row) => row.read_at === null);

  return (
    <div className="max-w-3xl px-6 py-7 sm:px-8 sm:pb-12">
      <PageHeader
        size="page"
        title="Notifications"
        description="What the tools you use have told you. Choose which ones you get, and whether they also come by email, in your preferences."
        actions={
          <>
            {anyUnread && (
              <form action={markAllNotificationsRead}>
                <Button type="submit" variant="secondary">
                  Mark all as read
                </Button>
              </form>
            )}
            <SecondaryLink href="/notifications/preferences">Preferences</SecondaryLink>
          </>
        }
      />
      {params.error && <Alert className="mt-4">{params.error}</Alert>}

      {rows.length === 0 ? (
        <EmptyState className="mt-6">
          Nothing yet. When a tool has something to tell you, it will appear here.
        </EmptyState>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded border border-line">
          {rows.map((row) => {
            const unread = row.read_at === null;
            const group = getNotificationType(row.type)?.group;
            return (
              <li key={row.id}>
                <form action={openNotification}>
                  <input type="hidden" name="id" value={row.id} />
                  <button
                    type="submit"
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-panel-50",
                      unread && "bg-brand-surface/40",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        unread ? "bg-brand-primary" : "bg-transparent",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-body text-ink-900",
                          unread ? "font-bold" : "font-semibold",
                        )}
                      >
                        {row.title}
                        {unread && <span className="sr-only"> (unread)</span>}
                      </span>
                      {row.body && (
                        <span className="mt-0.5 block text-ui text-ink-700">{row.body}</span>
                      )}
                      <span className="mt-1 block text-meta text-ink-400">
                        {group ? `${group} · ` : ""}
                        {formatShortDateTime(row.created_at)}
                      </span>
                    </span>
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination info={info} path="/notifications" params={{}} noun="notifications" />
      <p className="mt-6 text-meta text-ink-400">
        <Link
          href="/notifications/preferences"
          className="font-semibold text-brand-link hover:underline"
        >
          Change what you are told
        </Link>
        . Notifications older than 90 days are cleared.
      </p>
    </div>
  );
}
