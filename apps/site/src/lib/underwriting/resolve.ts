// Editorial underwriting resolution. Pure: no Payload, no React, no clock of its own. The caller loads
// a piece of content with the collections it belongs to and each collection's agreements, and this
// decides which acknowledgment lines the piece carries. Presentation only renders the result.
//
// The rules (canvas board 15, "How content, collections and underwriting connect"):
//  - Editors attach content to collections; the acknowledgment comes from the agreement record, so
//    changing its wording changes every page. Nobody pastes a sponsor line into a story.
//  - Only fellowships, series and productions can be underwritten. A topic is navigation, never a product.
//  - One line per agreement, however many collections lead to it. Fellowship before series before
//    production. Two lines at most on a page; any more go to the hub page.
//  - Dates are enforced. Recognition: work published during the term carries the line forever; work
//    published after it ends does not. A campaign is time-limited display: it shows only while it runs.
//  - An agreement applies only to the formats and placements it names.

export const FUNDABLE_KINDS = ["fellowship", "series", "production"] as const;
export type FundableKind = (typeof FUNDABLE_KINDS)[number];
export type CollectionKind = FundableKind | "topic" | "publishing_identity";

export type ContentFormat = "web" | "audio" | "video";
export type Placement = "article" | "card" | "episode" | "video" | "hub";

/** How an agreement's dates are read. */
export type AgreementKind = "recognition" | "campaign";

export interface Agreement {
  id: string;
  sponsorId: string;
  sponsorName: string;
  /** The approved acknowledgment, verbatim. */
  text: string;
  /** A shorter form for promo cards. Derived from the sponsor's name when absent. */
  shortText?: string;
  /** Bumped whenever the wording changes, for audit. */
  textVersion: number;
  kind: AgreementKind;
  /** Inclusive, ISO date (YYYY-MM-DD). */
  startsOn: string;
  /** Inclusive; null means the term is open. */
  endsOn: string | null;
  active: boolean;
  /** Empty means every format. */
  formats: ContentFormat[];
  /** Empty means every placement. */
  placements: Placement[];
  logoMediaId?: string;
  url?: string;
}

export interface CollectionRef {
  id: string;
  kind: CollectionKind;
  slug: string;
  title: string;
  /** Agreements attached to this collection. Only meaningful for fundable kinds. */
  agreements: Agreement[];
}

export interface ContentRef {
  id: string;
  format: ContentFormat;
  /** ISO timestamp the piece was (or will be) published. Unpublished content carries no recognition. */
  publishedAt: string | null;
  collections: CollectionRef[];
}

export interface ResolveContext {
  placement: Placement;
  /** ISO timestamp; the caller supplies it so the function stays deterministic. */
  now: string;
  /** Lines shown inline before the rest are sent to the hub. */
  maxInline?: number;
}

export interface AcknowledgmentLine {
  agreementId: string;
  sponsorId: string;
  sponsorName: string;
  /** The line to render for this placement: `text`, or the short form on a card. */
  text: string;
  /** The collection that brought the agreement to this piece (the highest-ranked one). */
  via: { kind: FundableKind; id: string; slug: string; title: string };
  logoMediaId?: string;
  url?: string;
  textVersion: number;
}

export interface Resolution {
  /** Render these, in order. */
  lines: AcknowledgmentLine[];
  /** Applicable but over the cap: list on the collection's hub page instead. */
  overflow: AcknowledgmentLine[];
  /** Cache tags: invalidate these and every page that resolved through them is refreshed. */
  tags: string[];
}

export const DEFAULT_MAX_INLINE = 2;

const KIND_RANK: Record<FundableKind, number> = { fellowship: 0, series: 1, production: 2 };

function isFundable(kind: CollectionKind): kind is FundableKind {
  return (FUNDABLE_KINDS as readonly string[]).includes(kind);
}

/** The calendar day (UTC) of an ISO timestamp. Terms are whole days, so a timestamp is compared by its day. */
function dayOf(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`Not a timestamp: ${iso}`);
  return new Date(t).toISOString().slice(0, 10);
}

function inTerm(day: string, a: Agreement): boolean {
  return day >= a.startsOn && (a.endsOn === null || day <= a.endsOn);
}

/** Whether one agreement acknowledges this piece in this context. */
export function agreementApplies(a: Agreement, content: ContentRef, ctx: ResolveContext): boolean {
  if (!a.active) return false;
  if (a.formats.length > 0 && !a.formats.includes(content.format)) return false;
  if (a.placements.length > 0 && !a.placements.includes(ctx.placement)) return false;
  if (a.kind === "recognition") {
    // Carried forever by work published during the term; never by work from before or after it.
    if (content.publishedAt === null) return false;
    return inTerm(dayOf(content.publishedAt), a);
  }
  // A campaign is display, not history: it runs only while the term does.
  return inTerm(dayOf(ctx.now), a);
}

export function shortForm(a: Agreement): string {
  return a.shortText?.trim() ? a.shortText : `Supported in part by ${a.sponsorName}`;
}

export function resolveUnderwriting(content: ContentRef, ctx: ResolveContext): Resolution {
  const max = ctx.maxInline ?? DEFAULT_MAX_INLINE;
  if (!Number.isInteger(max) || max < 0) throw new Error("maxInline must be a non-negative integer");

  // Every agreement reachable through a fundable collection, remembering the best-ranked route to it.
  interface Candidate { agreement: Agreement; via: AcknowledgmentLine["via"] }
  const byAgreement = new Map<string, Candidate>();
  const touched = new Set<string>();

  for (const collection of content.collections) {
    if (!isFundable(collection.kind)) continue;
    touched.add(`collection:${collection.id}`);
    for (const agreement of collection.agreements) {
      touched.add(`agreement:${agreement.id}`);
      if (!agreementApplies(agreement, content, ctx)) continue;
      const route = { kind: collection.kind, id: collection.id, slug: collection.slug, title: collection.title };
      const existing = byAgreement.get(agreement.id);
      if (!existing || compareRoutes(route, existing.via) < 0) byAgreement.set(agreement.id, { agreement, via: route });
    }
  }

  const ordered = [...byAgreement.values()].sort((x, y) => {
    const byKind = KIND_RANK[x.via.kind] - KIND_RANK[y.via.kind];
    if (byKind !== 0) return byKind;
    if (x.agreement.startsOn !== y.agreement.startsOn) return x.agreement.startsOn < y.agreement.startsOn ? -1 : 1;
    return x.agreement.id < y.agreement.id ? -1 : x.agreement.id > y.agreement.id ? 1 : 0;
  });

  const toLine = ({ agreement, via }: Candidate): AcknowledgmentLine => ({
    agreementId: agreement.id,
    sponsorId: agreement.sponsorId,
    sponsorName: agreement.sponsorName,
    text: ctx.placement === "card" ? shortForm(agreement) : agreement.text,
    via,
    textVersion: agreement.textVersion,
    ...(agreement.logoMediaId ? { logoMediaId: agreement.logoMediaId } : {}),
    ...(agreement.url ? { url: agreement.url } : {}),
  });

  const lines = ordered.slice(0, max).map(toLine);
  const overflow = ordered.slice(max).map(toLine);
  const tags = [`content:${content.id}`, ...[...touched].sort()];
  return { lines, overflow, tags };
}

function compareRoutes(a: { kind: FundableKind; id: string }, b: { kind: FundableKind; id: string }): number {
  const byKind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
  if (byKind !== 0) return byKind;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The tags to revalidate when an agreement changes: every page that resolved through it carries this tag. */
export function agreementTag(agreementId: string): string {
  return `agreement:${agreementId}`;
}

/** The tags to revalidate when a collection's membership or agreements change. */
export function collectionTag(collectionId: string): string {
  return `collection:${collectionId}`;
}

/** Whether a term is valid: a non-empty start, and an end not before it. */
export function validateTerm(startsOn: string, endsOn: string | null): string | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const real = (d: string) => iso.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
  if (!real(startsOn)) return "The start date must be a real date (YYYY-MM-DD).";
  if (endsOn !== null) {
    if (!real(endsOn)) return "The end date must be a real date (YYYY-MM-DD).";
    if (endsOn < startsOn) return "The end date cannot be before the start date.";
  }
  return null;
}
