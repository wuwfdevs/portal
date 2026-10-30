// Traffic's navigation — pure. Five tabs, each a job rather than a record type:
// Dashboard · Contracts · Needs attention (Exceptions, Affidavits) · Library
// (Underwriters, Copy) · Setup, set apart at the right edge. Routes did not
// move; a section just lights for every route inside it, and the pages of a
// section are the `SubNav` under the tabs. See docs/ui-patterns.md,
// "Navigation shapes", and docs/underwriting-traffic-redesign.md §17.

export type TrafficSection = "dashboard" | "contracts" | "attention" | "library" | "setup";

export interface TrafficNavCounts {
  /** Open exceptions waiting on a person's decision (not on the agency, an auto-fill, or an airing). */
  exceptionsNeedingDecision: number;
  /** Affidavits drafted and not yet signed. */
  affidavitsAwaitingSignature: number;
}

export interface TrafficTab {
  section: TrafficSection;
  label: string;
  href: string;
  end?: boolean;
  badge: number;
}

export interface TrafficSubItem {
  href: string;
  label: string;
  active: boolean;
  count?: number;
}

const ROOT = "/underwriting";

function within(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function trafficSection(pathname: string): TrafficSection {
  if (within(pathname, `${ROOT}/contracts`)) return "contracts";
  if (within(pathname, `${ROOT}/exceptions`) || within(pathname, `${ROOT}/affidavits`)) {
    return "attention";
  }
  if (within(pathname, `${ROOT}/underwriters`) || within(pathname, `${ROOT}/copy`)) {
    return "library";
  }
  if (within(pathname, `${ROOT}/setup`)) return "setup";
  return "dashboard";
}

export function trafficTabs(counts: TrafficNavCounts): TrafficTab[] {
  return [
    { section: "dashboard", label: "Dashboard", href: ROOT, badge: 0 },
    { section: "contracts", label: "Contracts", href: `${ROOT}/contracts`, badge: 0 },
    {
      section: "attention",
      label: "Needs attention",
      href: `${ROOT}/exceptions`,
      badge: counts.exceptionsNeedingDecision + counts.affidavitsAwaitingSignature,
    },
    { section: "library", label: "Library", href: `${ROOT}/underwriters`, badge: 0 },
    { section: "setup", label: "Setup", href: `${ROOT}/setup`, end: true, badge: 0 },
  ];
}

/** The pages inside a section, or none when the tab is a single page (Dashboard, Contracts). */
export function trafficSubItems(
  section: TrafficSection,
  pathname: string,
  counts: TrafficNavCounts,
): TrafficSubItem[] {
  const on = (prefix: string) => within(pathname, prefix);
  switch (section) {
    case "attention":
      return [
        {
          href: `${ROOT}/exceptions`,
          label: "Exceptions",
          active: on(`${ROOT}/exceptions`),
          count: counts.exceptionsNeedingDecision,
        },
        {
          href: `${ROOT}/affidavits`,
          label: "Affidavits",
          active: on(`${ROOT}/affidavits`),
          count: counts.affidavitsAwaitingSignature,
        },
      ];
    case "library":
      return [
        { href: `${ROOT}/underwriters`, label: "Underwriters", active: on(`${ROOT}/underwriters`) },
        { href: `${ROOT}/copy`, label: "Copy", active: on(`${ROOT}/copy`) },
      ];
    case "setup":
      return [
        { href: `${ROOT}/setup`, label: "Overview", active: pathname === `${ROOT}/setup` },
        { href: `${ROOT}/setup/pools`, label: "Pools", active: on(`${ROOT}/setup/pools`) },
        {
          href: `${ROOT}/setup/industries`,
          label: "Industries",
          active: on(`${ROOT}/setup/industries`),
        },
        {
          href: `${ROOT}/setup/migration`,
          label: "Migration",
          active: on(`${ROOT}/setup/migration`),
        },
      ];
    default:
      return [];
  }
}
