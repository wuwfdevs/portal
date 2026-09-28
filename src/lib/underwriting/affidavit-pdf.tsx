import "server-only";
// The client-facing performance affidavit as a PDF (docs/underwriting-
// design.md §6). Rendered on the server with @react-pdf/renderer — pure
// JavaScript, so no headless browser ships with the deployment — from the
// same AffidavitDocument the affidavit page previews. Certifying stores the
// result once (affidavit-actions.ts); a draft is rendered on demand and
// marked as a draft on every page.

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { STATION_TIME_ZONE } from "@/lib/log/timezone";
import { STATION_LETTERHEAD, type AffidavitDocument } from "./affidavits";

export interface AffidavitPdfProps {
  document: AffidavitDocument;
  reportIdentifier: string;
  contractIdentifier: string;
  accountRep: string | null;
  /** The date printed as "Issued" — the certification date, or today for a draft. */
  issuedAt: string;
  certified: boolean;
  certifierName: string | null;
  certifierTitle: string | null;
}

const INK = "#0F1419";
const BODY = "#2B2F36";
const MUTED = "#5A6068";
const FAINT = "#8A9099";
const RULE = "#E2E5E9";
const BAND = "#F5F7F9";
const BRAND = "#185F95";
const BRAND_BRIGHT = "#3090D0";
// The green of the logo's "88.1".
const ACCENT = "#8DC63F";

const MARGIN_X = 54;

// react-pdf hyphenates by default, which splits a sponsor's name mid-word
// ("Black-ledge"). Wrap on whole words only.
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingBottom: 60,
    paddingHorizontal: MARGIN_X,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: BODY,
    // No lineHeight here: set on the page, it hides the absolutely positioned
    // fixed footer (confirmed in @react-pdf/renderer 4.9). Blocks that need
    // extra leading set their own.
  },
  band: { position: "absolute", top: 0, left: 0, right: 0, height: 6, flexDirection: "row" },
  bandMain: { flex: 1, backgroundColor: BRAND_BRIGHT },
  bandAccent: { width: 90, backgroundColor: ACCENT },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  logo: { width: 112, height: 47.3, marginBottom: 8 },
  stationLine: { color: MUTED, fontSize: 8.5 },
  titleBlock: { alignItems: "flex-end" },
  eyebrow: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: FAINT,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  title: { fontFamily: "Helvetica-Bold", fontSize: 20, color: BRAND },
  headerRule: { flexDirection: "row", marginTop: 14, marginBottom: 18 },
  headerRuleMain: { flex: 1, height: 1.5, backgroundColor: BRAND },
  columns: { flexDirection: "row", gap: 18 },
  card: { flex: 1, backgroundColor: BAND, borderRadius: 3, padding: 12 },
  cardLine: { marginBottom: 1.5 },
  label: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: FAINT,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  recipientName: { fontFamily: "Helvetica-Bold", fontSize: 11, color: INK, marginBottom: 1 },
  stationName: { fontFamily: "Helvetica-Bold", color: INK, fontSize: 9.5 },
  detailRow: { flexDirection: "row", marginBottom: 3 },
  detailKey: { width: 84, color: MUTED },
  detailValue: { flex: 1, color: INK },
  section: { marginTop: 22 },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 6,
  },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 11.5, color: INK },
  sectionAside: { fontSize: 8, color: MUTED },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: INK,
    paddingBottom: 4,
    paddingHorizontal: 6,
  },
  th: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  tr: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6 },
  trStripe: { backgroundColor: BAND },
  total: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: RULE,
    fontFamily: "Helvetica-Bold",
    color: INK,
  },
  strong: { fontFamily: "Helvetica-Bold", color: INK },
  makegood: { fontSize: 7.5, color: BRAND, marginTop: 1 },
  footnote: { color: MUTED, fontSize: 8, marginTop: 6 },
  empty: { color: MUTED, paddingVertical: 8, paddingHorizontal: 6 },
  certification: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: RULE,
    borderLeftWidth: 3,
    borderLeftColor: BRAND,
    borderRadius: 3,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  sentence: { fontSize: 10.5, color: INK, lineHeight: 1.45, marginBottom: 22 },
  signatureRow: { flexDirection: "row", gap: 24 },
  signatureField: { flex: 1 },
  signatureValue: { height: 24, justifyContent: "flex-end", color: INK },
  signatureName: { fontFamily: "Times-Italic", fontSize: 15, color: INK },
  signatureLine: { borderTopWidth: 0.75, borderTopColor: INK, marginTop: 4, paddingTop: 3 },
  signatureCaption: { fontSize: 7, color: FAINT, textTransform: "uppercase", letterSpacing: 0.6 },
  electronic: { marginTop: 10, fontSize: 7.5, color: MUTED },
  thanks: {
    marginTop: 20,
    textAlign: "center",
    color: BRAND,
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
  },
  footer: {
    position: "absolute",
    bottom: 26,
    left: MARGIN_X,
    right: MARGIN_X,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: RULE,
    paddingTop: 6,
    fontSize: 7.5,
    color: MUTED,
  },
  watermark: {
    position: "absolute",
    top: 340,
    left: 0,
    right: 0,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 72,
    letterSpacing: 8,
    color: "#D5DCE3",
    opacity: 0.45,
    transform: "rotate(-30deg)",
  },
});

function formatIssued(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: STATION_TIME_ZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// The logo is optional decoration: a missing file (the deployment bundle
// traces it via next.config.ts's outputFileTracingIncludes) falls back to the
// text letterhead rather than failing the document.
let logoPromise: Promise<Buffer | null> | null = null;
function loadLogo(): Promise<Buffer | null> {
  logoPromise ??= readFile(path.join(process.cwd(), "public", "wuwf-logo.png")).catch(() => null);
  return logoPromise;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailKey}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function AffidavitPdf({ props, logo }: { props: AffidavitPdfProps; logo: Buffer | null }) {
  const { document: doc } = props;
  const showLength = doc.rows.some((row) => row.length !== null);
  const col = {
    date: { width: showLength ? "23%" : "25%" },
    time: { width: "15%" },
    program: { width: showLength ? "30%" : "32%" },
    message: { width: showLength ? "22%" : "28%" },
    length: { width: "8%", textAlign: "right" as const },
  };
  const orderedTotal = doc.summary.reduce((sum, row) => sum + row.ordered, 0);
  const airedTotal = doc.summary.reduce((sum, row) => sum + row.aired, 0);

  return (
    <Document
      title={`Performance affidavit ${props.reportIdentifier}`}
      author={STATION_LETTERHEAD.name}
      subject={`${doc.recipientLines[0] ?? ""} — ${doc.periodLabel}`}
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.band} fixed>
          <View style={styles.bandMain} />
          <View style={styles.bandAccent} />
        </View>
        <View style={styles.footer} fixed>
          <Text>
            {STATION_LETTERHEAD.name} · Performance affidavit · Report {props.reportIdentifier}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>

        <View style={styles.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image, not an HTML img; it has no alt prop. */}
            {logo ? <Image src={logo} style={styles.logo} /> : null}
            <Text style={styles.stationName}>{STATION_LETTERHEAD.name}</Text>
            <Text style={styles.stationLine}>{STATION_LETTERHEAD.addressLines.join(" · ")}</Text>
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.eyebrow}>
              {props.certified ? "Certified" : "Draft — not yet certified"}
            </Text>
            <Text style={styles.title}>Performance Affidavit</Text>
          </View>
        </View>
        <View style={styles.headerRule}>
          <View style={styles.headerRuleMain} />
        </View>

        <View style={styles.columns}>
          <View style={styles.card}>
            <Text style={styles.label}>Prepared for</Text>
            {doc.recipientLines.map((line, index) => (
              <Text
                key={`${index}-${line}`}
                style={index === 0 ? styles.recipientName : styles.cardLine}
              >
                {line}
              </Text>
            ))}
          </View>
          <View style={[styles.card, { flex: 1.35 }]}>
            <Text style={styles.label}>Order</Text>
            <Detail label="Order number" value={props.contractIdentifier} />
            <Detail label="Period" value={doc.periodLabel} />
            {doc.lengthLabel ? <Detail label="Announcements" value={doc.lengthLabel} /> : null}
            {props.accountRep ? <Detail label="Account rep" value={props.accountRep} /> : null}
            <Detail label="Issued" value={formatIssued(props.issuedAt)} />
          </View>
        </View>

        {doc.summary.length > 0 && (
          <View style={styles.section} wrap={false}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Delivery</Text>
              <Text style={styles.sectionAside}>Announcements ordered and aired, by schedule</Text>
            </View>
            <View style={styles.tableHead}>
              <Text style={[styles.th, { width: "70%" }]}>Schedule</Text>
              <Text style={[styles.th, { width: "15%", textAlign: "right" }]}>Ordered</Text>
              <Text style={[styles.th, { width: "15%", textAlign: "right" }]}>Aired</Text>
            </View>
            {doc.summary.map((row, index) => (
              <View
                key={row.scheduleLineId}
                style={index % 2 === 1 ? [styles.tr, styles.trStripe] : styles.tr}
              >
                <Text style={{ width: "70%" }}>
                  {row.label}
                  {row.bonus ? " (bonus)" : ""}
                </Text>
                <Text style={{ width: "15%", textAlign: "right" }}>{row.ordered}</Text>
                <Text style={[styles.strong, { width: "15%", textAlign: "right" }]}>
                  {row.aired}
                </Text>
              </View>
            ))}
            {doc.summary.length > 1 && (
              <View style={styles.total}>
                <Text style={{ width: "70%" }}>Total</Text>
                <Text style={{ width: "15%", textAlign: "right" }}>{orderedTotal}</Text>
                <Text style={{ width: "15%", textAlign: "right" }}>{airedTotal}</Text>
              </View>
            )}
            {doc.outsideSummaryCount > 0 && (
              <Text style={styles.footnote}>
                {doc.outsideSummaryCount === 1
                  ? "1 further announcement in the log below counts toward a schedule period that extends beyond these dates."
                  : `${doc.outsideSummaryCount} further announcements in the log below count toward schedule periods that extend beyond these dates.`}
              </Text>
            )}
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Broadcast log</Text>
            <Text style={styles.sectionAside}>
              {doc.airedCount === 1 ? "1 announcement" : `${doc.airedCount} announcements`} ·
              Central time
            </Text>
          </View>
          {/* fixed inside this section: repeats at the top of each page the log continues onto. */}
          <View style={styles.tableHead} fixed>
            <Text style={[styles.th, col.date]}>Date</Text>
            <Text style={[styles.th, col.time]}>Time</Text>
            <Text style={[styles.th, col.program]}>Program</Text>
            <Text style={[styles.th, col.message]}>Message</Text>
            {showLength ? <Text style={[styles.th, col.length]}>Length</Text> : null}
          </View>
          {doc.rows.length === 0 ? (
            <Text style={styles.empty}>No announcements aired in this period.</Text>
          ) : (
            doc.rows.map((row, index) => (
              <View
                key={row.broadcastEventId}
                style={index % 2 === 1 ? [styles.tr, styles.trStripe] : styles.tr}
                wrap={false}
              >
                <Text style={col.date}>{row.date}</Text>
                <Text style={col.time}>{row.time}</Text>
                <Text style={col.program}>{row.program}</Text>
                <View style={col.message}>
                  <Text>{row.message ?? "—"}</Text>
                  {row.note ? <Text style={styles.makegood}>{row.note}</Text> : null}
                </View>
                {showLength ? <Text style={col.length}>{row.length ?? ""}</Text> : null}
              </View>
            ))
          )}
        </View>

        <View style={styles.certification} wrap={false}>
          <Text style={styles.label}>Affidavit of performance</Text>
          <Text style={styles.sentence}>{doc.certificationSentence}</Text>
          <View style={styles.signatureRow}>
            <View style={[styles.signatureField, { flex: 2 }]}>
              <View style={styles.signatureValue}>
                {props.certified && props.certifierName ? (
                  <Text style={styles.signatureName}>/s/ {props.certifierName}</Text>
                ) : null}
              </View>
              <View style={styles.signatureLine}>
                <Text style={styles.signatureCaption}>Signature</Text>
              </View>
            </View>
            <View style={[styles.signatureField, { flex: 1.4 }]}>
              <View style={styles.signatureValue}>
                <Text>{props.certified ? (props.certifierTitle ?? "") : ""}</Text>
              </View>
              <View style={styles.signatureLine}>
                <Text style={styles.signatureCaption}>Title</Text>
              </View>
            </View>
            <View style={styles.signatureField}>
              <View style={styles.signatureValue}>
                <Text>{props.certified ? formatIssued(props.issuedAt) : ""}</Text>
              </View>
              <View style={styles.signatureLine}>
                <Text style={styles.signatureCaption}>Date</Text>
              </View>
            </View>
          </View>
          {props.certified && (
            <Text style={styles.electronic}>
              {`Signed electronically in ${STATION_LETTERHEAD.name}’s traffic system`}
              {props.certifierName ? ` by ${props.certifierName}` : ""}.
            </Text>
          )}
        </View>

        <Text style={styles.thanks} wrap={false}>
          Thank you for supporting public radio on {STATION_LETTERHEAD.name}.
        </Text>
        {/* Last, so it draws over the cards rather than behind them. */}
        {!props.certified && (
          <Text style={styles.watermark} fixed>
            DRAFT
          </Text>
        )}
      </Page>
    </Document>
  );
}

export async function renderAffidavitPdf(props: AffidavitPdfProps): Promise<Buffer> {
  const logo = await loadLogo();
  return renderToBuffer(<AffidavitPdf props={props} logo={logo} />);
}
