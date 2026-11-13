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

/**
 * The one email a facilitator gets: the link to the page where they put names to their table's voices, mark what mattered and send.
 * The link is the credential, so the words say what it opens, how long it works and not to pass it on. The station's name comes from
 * the station's settings, never from here.
 */
export function facilitatorLinkEmailText(input: {
  stationName: string;
  firstName: string | null;
  eventTitle: string;
  tableNumber: number;
  url: string;
  expiresOn: string;
}): { subject: string; text: string } {
  const greeting = input.firstName?.trim() ? `Hello ${input.firstName.trim()},` : "Hello,";
  return {
    subject: `Name the voices and mark what mattered at table ${input.tableNumber}`,
    text: [
      greeting,
      "",
      `Thank you for facilitating table ${input.tableNumber} at ${input.eventTitle}. The transcript of your table's conversation is ready.`,
      "",
      `Open this link on any phone or computer to put names to the voices, mark the lines that mattered and send them to ${input.stationName}. It takes about ten minutes.`,
      "",
      input.url,
      "",
      `The link opens your table's conversation only, and works until ${input.expiresOn}. Anyone who has it can read and change that conversation, so please do not forward it.`,
      "",
      "If you were not expecting this, you can ignore it.",
    ].join("\n"),
  };
}
