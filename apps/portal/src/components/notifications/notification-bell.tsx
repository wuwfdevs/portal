import Link from "next/link";
import { cn } from "@/lib/cn";
import { bellLabel, unreadBadge } from "@/lib/notifications/unread";

/**
 * The header's link to the Notification Center, with the unread count on it. `unread` is null when the count could not be read (the
 * table is missing), which shows the bell with no number rather than failing the page.
 */
export function NotificationBell({ unread, active }: { unread: number | null; active: boolean }) {
  const badge = unreadBadge(unread);
  return (
    <Link
      href="/notifications"
      aria-label={bellLabel(unread)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center rounded p-1.5 sm:px-2.5",
        active ? "bg-brand-surface text-brand-link" : "text-ink-700 hover:bg-panel-50",
      )}
    >
      {/* Lucide bell */}
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {badge && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-brand-primary px-1 text-center text-badge font-bold leading-4 text-white"
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
