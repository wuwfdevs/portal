// The words of a notification email (docs/notifications-design.md §5). Pure and station-neutral: the Portal names no station in a message.
// Plain text. The title and body are what the raising tool wrote; this adds the link and the way to stop getting it.

export interface NotificationEmailInput {
  title: string;
  body: string;
  /** A local path, or null. */
  href: string | null;
}

export function notificationEmailText(
  input: NotificationEmailInput,
  origin: string,
): { subject: string; text: string } {
  const base = origin.replace(/\/+$/, "");
  const lines: string[] = [];
  if (input.body.trim()) lines.push(input.body.trim(), "");
  if (input.href) lines.push(`Open it: ${base}${input.href}`, "");
  lines.push(`Choose which notifications you get, and where: ${base}/notifications/preferences`);
  return { subject: input.title.replace(/\s+/g, " ").trim(), text: lines.join("\n") };
}

/**
 * The key a queued notification's email is sent under. It is the notification's own id, so every attempt at one row (a retry after the
 * send succeeded but recording it failed, or after the worker stopped) carries the same key and Resend sends it once.
 */
export function notificationIdempotencyKey(notificationId: string): string {
  return `notification/${notificationId}`;
}
