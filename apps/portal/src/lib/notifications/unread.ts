// How the bell shows its count. Pure.

export const UNREAD_CAP = 99;

/** The bell's badge: nothing for none, the number up to the cap, then "99+". Null (could not be read) shows nothing too. */
export function unreadBadge(count: number | null): string | null {
  if (count === null || count <= 0) return null;
  return count > UNREAD_CAP ? `${UNREAD_CAP}+` : String(count);
}

/** The bell's accessible name, which says the count in words. */
export function bellLabel(count: number | null): string {
  if (count === null || count <= 0) return "Notifications";
  return `Notifications, ${count} unread`;
}
