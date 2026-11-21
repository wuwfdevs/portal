import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { pageRange, DEFAULT_PAGE_SIZE } from "@/lib/pagination";

// A signed-in person's own notifications, under RLS. The select grant omits the email delivery columns, so `select *` is refused:
// name the columns (docs/notifications-design.md §3).
const COLUMNS = "id, type, title, body, href, created_at, read_at";

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  created_at: string;
  read_at: string | null;
}

/** The bell's count. Null when it cannot be read (the migration is not applied yet), so a missing table never fails every page. */
export async function getUnreadCount(userId: string): Promise<number | null> {
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("notification_inbox")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .eq("in_app", true)
      .is("read_at", null);
    if (error) {
      console.error("Notifications: could not count unread", error.code ?? "");
      return null;
    }
    return count ?? 0;
  } catch {
    return null;
  }
}

export async function listNotifications(
  userId: string,
  page: number,
): Promise<{ rows: NotificationRow[]; total: number }> {
  const supabase = await createClient();
  const { from, to } = pageRange(page, DEFAULT_PAGE_SIZE);
  const result = await supabase
    .from("notification_inbox")
    .select(COLUMNS, { count: "exact" })
    .eq("recipient_id", userId)
    .eq("in_app", true)
    .order("created_at", { ascending: false })
    .range(from, to);
  const data = unwrapRead(result, "the notifications");
  return { rows: (data ?? []) as NotificationRow[], total: result.count ?? 0 };
}

export async function listStoredPreferences(
  userId: string,
): Promise<{ type: string; in_app: boolean; email: boolean }[]> {
  const supabase = await createClient();
  const data = unwrapRead(
    await supabase
      .from("notification_preferences")
      .select("type, in_app, email")
      .eq("user_id", userId),
    "your notification preferences",
  );
  return data ?? [];
}
