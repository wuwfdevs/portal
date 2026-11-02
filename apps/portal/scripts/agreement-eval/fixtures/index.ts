// Which document in this folder is which order in the acceptance corpus
// (src/lib/underwriting/fixtures/insertion-orders.ts, by its `name`), plus
// the contract facts a staffer would have entered on the Order step before
// reading the document. The PDFs themselves are the signed originals on
// WUWF's Drive (the sponsorship-agreements folder, titles in the comments)
// and are added here by hand — see README.md.

export interface FixtureDocument {
  /** File name in this folder. */
  file: string;
  /** FixtureOrder.name in insertion-orders.ts. */
  order: string;
  underwriterName: string;
  contractIdentifier: string;
}

export const FIXTURE_DOCUMENTS: FixtureDocument[] = [
  // Drive: "Autumn Beck Blackledge - 8-26 thru 2-27.pdf" — the reference agreement; three fixed-days lines with preferred times.
  {
    file: "autumn-beck-blackledge-2026.pdf",
    order: "Autumn Beck Blackledge",
    underwriterName: "Autumn Beck Blackledge",
    contractIdentifier: "ABB-2026",
  },
  // Drive: "Boyles and Boyles - 9-26 thru 9-27.pdf" — weekly quotas, a Weekend Edition either/or.
  {
    file: "boyles-and-boyles-2026.pdf",
    order: "Boyles & Boyles",
    underwriterName: "Boyles & Boyles",
    contractIdentifier: "BOYLES-2026",
  },
  // Drive: "Move Period - 8-26 thru 11-26.pdf" — fixed days across AM/PM drive, affidavits yes.
  {
    file: "move-period-2026.pdf",
    order: "Move Period",
    underwriterName: "Move Period",
    contractIdentifier: "MOVE-2026",
  },
  // Drive: "309 Punk Project - 10-26 thru 1-27.pdf" — explicit dates, with the "Oct. 3 is a Saturday" inconsistency.
  {
    file: "309-punk-project-2026.pdf",
    order: "309 Punk Project",
    underwriterName: "309 Punk Project",
    contractIdentifier: "309-2026",
  },
  // Drive: "Choral Society of Pensacola - 10-26 thru 5-27.pdf" — four concert flights.
  {
    file: "choral-society-2026.pdf",
    order: "Choral Society of Pensacola",
    underwriterName: "Choral Society of Pensacola",
    contractIdentifier: "CHORAL-2026",
  },
  // Drive: "Emerald Coast Theatre Company - 9-26 thru 5-27.pdf" — six productions with explicit dates.
  {
    file: "emerald-coast-theatre-2026.pdf",
    order: "Emerald Coast Theatre Company",
    underwriterName: "Emerald Coast Theatre Company",
    contractIdentifier: "ECTC-2026",
  },
  // Drive: "Lynn Keefe Pediatrics - 6-26 thru 6-27.pdf" — one Carpool line at an exact time.
  {
    file: "lynn-keefe-pediatrics-2026.pdf",
    order: "Lynn Keefe Pediatrics",
    underwriterName: "Lynn Keefe Pediatrics",
    contractIdentifier: "KEEFE-2026",
  },
  // Drive: "Open Books - 9-26 thru 9-27.pdf" — one Carpool line at an exact time.
  {
    file: "open-books-2026.pdf",
    order: "Open Books",
    underwriterName: "Open Books",
    contractIdentifier: "OPENBOOKS-2026",
  },
  // Drive: "Pensacola Symphony - 9-25 thru 4-26 Updated IO.pdf" — five event flights, one cancelled and replaced.
  {
    file: "pensacola-symphony-2025-26.pdf",
    order: "Pensacola Symphony Orchestra 2025-26",
    underwriterName: "Pensacola Symphony Orchestra",
    contractIdentifier: "PSO-2025",
  },
  // Drive: "West Moss - 7-26 thru 10-26.pdf"
  {
    file: "west-moss-2026.pdf",
    order: "West Moss",
    underwriterName: "West Moss",
    contractIdentifier: "WESTMOSS-2026",
  },
  // Drive: "New South Windows IO Aug rev.pdf" — an agency order; 10 a week M–F, two a day.
  {
    file: "new-south-windows-2025.pdf",
    order: "New South Window Solutions",
    underwriterName: "New South Window Solutions",
    contractIdentifier: "NSWS-2025",
  },
];

/** The inventory pools on file in production (2026-09-27). Ids are the names in this eval. */
export const POOL_NAMES = [
  "AM Drive",
  "Carpool",
  "Mid-day",
  "PM Drive",
  "Total Program Rotation",
  "Weekend Edition",
];

/** The programs on file in production (2026-09-27). */
export const PROGRAM_NAMES = [
  "14/59",
  "1A",
  "Acoustic Interlude",
  "All Things Considered",
  "All Things Considered (Weekends)",
  "American Routes",
  "BBC World",
  "Big Bands & Jazz",
  "Capital Report",
  "CLOUDS with Dale Riegle",
  "Echoes",
  "eTown",
  "Five Corners",
  "Florida Frontiers",
  "Fresh Air",
  "Fresh Air Weekend",
  "Hearts of Space",
  "Here & Now",
  "Hidden Brain",
  "Jazz After Hours",
  "Jazz Happening Now",
  "Jazz Night in America",
  "Jazz with Dale Riegle",
  "Le Show",
  "Living on Earth",
  "Marketplace",
  "Morning Edition",
  "Mountain Stage",
  "Musical Gumbo",
  "On the Media",
  "Open to Debate",
  "Putumayo World Music Hour",
  "RadioLive",
  "RadioLive Encores",
  "Science Friday",
  "Selected Shorts",
  "TED Radio Hour",
  "The Florida Roundup",
  "The World",
  "This American Life",
  "Travel with Rick Steves",
  "Wait Wait... Don't Tell Me!",
  "Weekend Edition Saturday",
  "Weekend Edition Sunday",
  "World Cafe",
];
