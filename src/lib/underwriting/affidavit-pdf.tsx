import "server-only";
// The client-facing performance affidavit as a PDF (docs/underwriting-
// design.md §6). Rendered on the server with @react-pdf/renderer — pure
// JavaScript, so no headless browser ships with the deployment — from the
// same AffidavitDocument the affidavit page previews. Certifying stores the
// result once (affidavit-actions.ts); a draft is rendered on demand and
// marked as a draft on every page.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
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
const MUTED = "#5A6068";
const FAINT = "#8A9099";
const RULE = "#D5D9DE";
const BAND = "#F5F7F9";
const BRAND = "#185F95";

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 64,
    paddingHorizontal: 54,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: INK,
    lineHeight: 1.35,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { width: 96, height: 40.5, marginBottom: 6 },
  stationName: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  stationLine: { color: MUTED },
  titleBlock: { alignItems: "flex-end" },
  title: { fontFamily: "Helvetica-Bold", fontSize: 18, color: BRAND, marginBottom: 8 },
  meta: { color: MUTED },
  rule: { borderBottomWidth: 1, borderBottomColor: RULE, marginVertical: 16 },
  columns: { flexDirection: "row", gap: 24 },
  column: { flex: 1 },
  label: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: FAINT,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  recipientName: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  detailRow: { flexDirection: "row", marginBottom: 2 },
  detailKey: { width: 84, color: MUTED },
  detailValue: { flex: 1 },
  section: { marginTop: 20 },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 6 },
  tableHead: {
    flexDirection: "row",
    backgroundColor: BAND,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8, color: MUTED },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
    paddingVertical: 4.5,
    paddingHorizontal: 6,
  },
  note: { color: BRAND, fontSize: 8.5 },
  footnote: { color: MUTED, fontSize: 8.5, marginTop: 6 },
  empty: { color: MUTED, paddingVertical: 8, paddingHorizontal: 6 },
  certification: { marginTop: 28 },
  sentence: { fontSize: 10.5, marginBottom: 26 },
  signatureRow: { flexDirection: "row", gap: 32 },
  signatureField: { flex: 1 },
  signatureValue: { minHeight: 16, fontSize: 11 },
  signatureName: { fontFamily: "Helvetica-Oblique", fontSize: 12 },
  signatureLine: { borderTopWidth: 1, borderTopColor: INK, marginTop: 2, paddingTop: 3 },
  signatureCaption: { fontSize: 7.5, color: MUTED },
  electronic: { marginTop: 8, fontSize: 8, color: MUTED },
  thanks: { marginTop: 28, textAlign: "center", color: MUTED, fontFamily: "Helvetica-Oblique" },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 54,
    right: 54,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: FAINT,
  },
  watermark: {
    position: "absolute",
    top: 330,
    left: 0,
    right: 0,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 64,
    color: "#E7EBEF",
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
    date: { width: "20%" },
    time: { width: "13%" },
    program: { width: showLength ? "23%" : "25%" },
    message: { width: showLength ? "16%" : "17%" },
    length: { width: "7%" },
    note: { width: showLength ? "21%" : "25%" },
  } as const;

  return (
    <Document
      title={`Performance affidavit ${props.reportIdentifier}`}
      author={STATION_LETTERHEAD.name}
      subject={`${doc.recipientLines[0] ?? ""} — ${doc.periodLabel}`}
    >
      <Page size="LETTER" style={styles.page}>
        {!props.certified && (
          <Text style={styles.watermark} fixed>
            DRAFT
          </Text>
        )}

        <View style={styles.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image, not an HTML img; it has no alt prop. */}
            {logo ? <Image src={logo} style={styles.logo} /> : null}
            <Text style={styles.stationName}>{STATION_LETTERHEAD.name}</Text>
            {STATION_LETTERHEAD.addressLines.map((line) => (
              <Text key={line} style={styles.stationLine}>
                {line}
              </Text>
            ))}
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Performance Affidavit</Text>
            <Text style={styles.meta}>Issued {formatIssued(props.issuedAt)}</Text>
            <Text style={styles.meta}>Report {props.reportIdentifier}</Text>
            {!props.certified && <Text style={styles.meta}>Draft — not yet certified</Text>}
          </View>
        </View>

        <View style={styles.rule} />

        <View style={styles.columns}>
          <View style={styles.column}>
            <Text style={styles.label}>Prepared for</Text>
            {doc.recipientLines.map((line, index) => (
              <Text key={`${index}-${line}`} style={index === 0 ? styles.recipientName : undefined}>
                {line}
              </Text>
            ))}
          </View>
          <View style={styles.column}>
            <Text style={styles.label}>Order</Text>
            <Detail label="Order number" value={props.contractIdentifier} />
            <Detail label="Period" value={doc.periodLabel} />
            {props.accountRep ? <Detail label="Account rep" value={props.accountRep} /> : null}
            {doc.lengthLabel ? <Detail label="Announcements" value={doc.lengthLabel} /> : null}
          </View>
        </View>

        {doc.summary.length > 0 && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>Delivery</Text>
            <View style={styles.tableHead}>
              <Text style={[styles.th, { width: "64%" }]}>Schedule</Text>
              <Text style={[styles.th, { width: "18%", textAlign: "right" }]}>Ordered</Text>
              <Text style={[styles.th, { width: "18%", textAlign: "right" }]}>Aired</Text>
            </View>
            {doc.summary.map((row) => (
              <View key={row.scheduleLineId} style={styles.tr}>
                <Text style={{ width: "64%" }}>
                  {row.label}
                  {row.bonus ? " (bonus)" : ""}
                </Text>
                <Text style={{ width: "18%", textAlign: "right" }}>{row.ordered}</Text>
                <Text style={{ width: "18%", textAlign: "right" }}>{row.aired}</Text>
              </View>
            ))}
            {doc.outsideSummaryCount > 0 && (
              <Text style={styles.footnote}>
                {doc.outsideSummaryCount === 1
                  ? "1 further announcement below counts toward a schedule period that extends beyond these dates."
                  : `${doc.outsideSummaryCount} further announcements below count toward schedule periods that extend beyond these dates.`}
              </Text>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Broadcast log</Text>
          <View style={styles.tableHead}>
            <Text style={[styles.th, col.date]}>Date</Text>
            <Text style={[styles.th, col.time]}>Time</Text>
            <Text style={[styles.th, col.program]}>Program</Text>
            <Text style={[styles.th, col.message]}>Message</Text>
            {showLength ? <Text style={[styles.th, col.length]}>Length</Text> : null}
            <Text style={[styles.th, col.note]}>Note</Text>
          </View>
          {doc.rows.length === 0 ? (
            <Text style={styles.empty}>No announcements aired in this period.</Text>
          ) : (
            doc.rows.map((row) => (
              <View key={row.broadcastEventId} style={styles.tr} wrap={false}>
                <Text style={col.date}>{row.date}</Text>
                <Text style={col.time}>{row.time}</Text>
                <Text style={col.program}>{row.program}</Text>
                <Text style={col.message}>{row.message ?? "—"}</Text>
                {showLength ? <Text style={col.length}>{row.length ?? ""}</Text> : null}
                <Text style={[col.note, styles.note]}>{row.note ?? ""}</Text>
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
              {`Certified electronically in ${STATION_LETTERHEAD.name}’s traffic system`}
              {props.certifierName ? ` by ${props.certifierName}` : ""}.
            </Text>
          )}
          <Text style={styles.thanks}>
            Thank you for your support of {STATION_LETTERHEAD.name}.
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>
            {STATION_LETTERHEAD.name} · Performance affidavit {props.reportIdentifier}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderAffidavitPdf(props: AffidavitPdfProps): Promise<Buffer> {
  const logo = await loadLogo();
  return renderToBuffer(<AffidavitPdf props={props} logo={logo} />);
}
