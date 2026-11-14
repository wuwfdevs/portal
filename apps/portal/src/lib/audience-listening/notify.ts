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

/**
 * Emails a facilitator their after-page link. Unlike the host-request notice this is not best effort: the staff member who pressed the
 * button is told whether it went, because the link is only useful if it arrived. Never logs the address or the link.
 */
export async function sendFacilitatorLink(to: string, message: { subject: string; text: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const result = await sendEmail({ to, subject: message.subject, text: message.text });
    if (!result.ok) console.error("Listening: could not email a facilitator's link:", result.error);
    return result;
  } catch (error) {
    console.error("Listening: could not email a facilitator's link:", error instanceof Error ? error.name : "unknown error");
    return { ok: false, error: "The email could not be sent." };
  }
}
