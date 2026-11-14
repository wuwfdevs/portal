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

/** The reminder that conversations are waiting for the coordinator's purge. Counts only; it says where the button is. */
export function purgeReminderEmailText(counts: { conversations: number; submissions: number }, purgeUrl: string): { subject: string; text: string } {
  const parts: string[] = [];
  if (counts.conversations > 0) parts.push(`${counts.conversations} ${counts.conversations === 1 ? "conversation that was" : "conversations that were"} never sent`);
  if (counts.submissions > 0) parts.push(`${counts.submissions} unfinished ${counts.submissions === 1 ? "answer" : "answers"}`);
  return {
    subject: "Listening recordings are past their thirty days",
    text: [
      `${parts.join(" and ")} ${counts.conversations + counts.submissions === 1 ? "is" : "are"} past the thirty days the station keeps them.`,
      "",
      `Look at what would go, and remove it when you are ready: ${purgeUrl}`,
      "",
      "Nothing is removed until a coordinator presses the button there.",
    ].join("\n"),
  };
}

/** The daily "waiting" email: how many, and how many requests to host are past the five days the website promised. No one's words. */
export function askDigestEmailText(
  counts: { questions: number; hostRequests: number; hostRequestsLate: number },
  urls: { questions: string; hostRequests: string },
): { subject: string; text: string } {
  const lines: string[] = [];
  if (counts.questions > 0) lines.push(`${counts.questions} new ${counts.questions === 1 ? "question or idea" : "questions and ideas"}: ${urls.questions}`);
  if (counts.hostRequests > 0) {
    lines.push(
      `${counts.hostRequests} ${counts.hostRequests === 1 ? "request" : "requests"} to host a listening session${counts.hostRequestsLate > 0 ? `, ${counts.hostRequestsLate} waiting more than five days` : ""}: ${urls.hostRequests}`,
    );
  }
  return {
    subject: counts.hostRequestsLate > 0 ? "Listening requests are waiting, some past five days" : "Listening questions and requests are waiting",
    text: ["Waiting for someone to read:", "", ...lines, "", "The website tells people someone will write back within a week."].join("\n"),
  };
}

/** Whether the Ask digest has anything to say. */
export function digestHasNews(counts: { questions: number; hostRequests: number }): boolean {
  return counts.questions > 0 || counts.hostRequests > 0;
}

/** Whether a weekly reminder is due: never sent, or last sent at least six days ago (so a daily schedule lands once a week). */
export function weeklyDue(lastSentAt: Date | null, now: Date): boolean {
  return !lastSentAt || now.getTime() - lastSentAt.getTime() >= 6 * 24 * 60 * 60 * 1000;
}
