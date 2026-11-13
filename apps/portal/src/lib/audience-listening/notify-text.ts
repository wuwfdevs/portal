// The pure half of the host-request notification: the words, and reading the mailbox setting. No Resend, no Next.

const EMAIL_SHAPE = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;

/** The configured mailbox, or null if unset or not one address. A list of addresses is refused: it is one shared mailbox, not a person. */
export function parseNotifyAddress(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value && value.length <= 320 && EMAIL_SHAPE.test(value) ? value : null;
}

/** Says that a request is waiting and where to read it. Nothing the visitor wrote is in it. */
export function hostRequestEmailText(portalUrl: string): { subject: string; text: string } {
  return {
    subject: "A request to host a listening session is waiting",
    text: [
      "Someone asked to bring a listening session to their table.",
      "",
      `Read it and mark where it stands: ${portalUrl}`,
      "",
      "The website tells people someone will write back within a week.",
    ].join("\n"),
  };
}
