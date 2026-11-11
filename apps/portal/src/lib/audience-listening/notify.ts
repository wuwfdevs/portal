import "server-only";
import { sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";
import { hostRequestEmailText, parseNotifyAddress } from "./notify-text";

/**
 * One email to a shared mailbox when a host request arrives (design §11, item 3), through the Portal's existing Resend sender. The
 * mailbox is `AUDIENCE_LISTENING_NOTIFY_EMAIL`; unset, nothing is sent and the staff list's counts and five-day flag remain the signal.
 * Best effort: a failure is logged and never fails the visitor's request, which has already been saved. The email says that one is
 * waiting and where to read it. It carries no name, address or message, so nothing a visitor wrote travels by email.
 */
export async function notifyHostRequest(): Promise<void> {
  const to = parseNotifyAddress(process.env.AUDIENCE_LISTENING_NOTIFY_EMAIL);
  if (!to) return;
  try {
    const { subject, text } = hostRequestEmailText(`${getSiteUrl()}/audience-listening/host-requests`);
    const result = await sendEmail({ to, subject, text });
    if (!result.ok) console.error("Listening: could not email about a host request:", result.error);
  } catch (error) {
    console.error("Listening: could not email about a host request:", error);
  }
}
