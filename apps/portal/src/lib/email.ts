import "server-only";
import { Resend } from "resend";

/**
 * The portal's first real transactional email sender. Everything before this
 * either used Supabase Auth's own invite/magic-link mail (account creation
 * and sign-in only, not something a Server Action can trigger for an
 * arbitrary address) or a mailto:/copy-to-clipboard draft — see the "Email"
 * sections of docs/audience-listening-design.md and
 * docs/academic-partnerships-design.md for why those tools stopped there.
 *
 * Follows this repo's established optional-external-service pattern
 * (DAILY_API_KEY, MISTRAL_API_KEY): unset RESEND_API_KEY/RESEND_FROM_EMAIL
 * means sendEmail() returns a clear "not configured" failure rather than
 * throwing or silently no-op'ing, and callers are expected to keep a
 * draft/mailto fallback available regardless of whether this is configured.
 */

let client: Resend | null = null;

function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Resend(apiKey);
  return client;
}

export function isEmailSendingConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export type SendEmailResult = { ok: true } | { ok: false; error: string };

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const resend = getClient();
  const from = process.env.RESEND_FROM_EMAIL;
  if (!resend || !from) {
    return { ok: false, error: "Email sending is not configured." };
  }

  const { error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
    replyTo: params.replyTo,
  });

  if (error) {
    console.error("Resend send failed", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
