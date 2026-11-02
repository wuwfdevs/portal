import type { AffidavitPdfProps } from "./affidavit-pdf";
import type { AffidavitDetail } from "./queries";

/** The PDF's props from an affidavit — shared by the draft download and certification, so both render the same thing. */
export function affidavitPdfProps(
  affidavit: AffidavitDetail,
  signature:
    | { certified: false }
    | { certified: true; certifierName: string; certifierTitle: string; certifiedAt: string },
): AffidavitPdfProps {
  return {
    document: affidavit.document,
    reportIdentifier: affidavit.report_identifier,
    contractIdentifier: affidavit.contract.contract_identifier,
    accountRep: affidavit.contract.account_rep,
    issuedAt: signature.certified ? signature.certifiedAt : new Date().toISOString(),
    certified: signature.certified,
    certifierName: signature.certified ? signature.certifierName : null,
    certifierTitle: signature.certified ? signature.certifierTitle : null,
  };
}
