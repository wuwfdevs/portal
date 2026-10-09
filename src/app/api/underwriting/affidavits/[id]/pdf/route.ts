import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guardRoute } from "@/lib/auth/route-guard";
import { assertUnderwritingAccess } from "@/lib/underwriting/access";
import { getAffidavitDetail } from "@/lib/underwriting/queries";
import { affidavitFileName } from "@/lib/underwriting/affidavits";
import { affidavitPdfProps } from "@/lib/underwriting/affidavit-pdf-props";
import { renderAffidavitPdf } from "@/lib/underwriting/affidavit-pdf";

/**
 * The affidavit as a PDF. A route handler rather than a Server Action
 * because the result is a file, not data (same reason as clips.zip and
 * tracks.zip). A certified affidavit serves the file stored when it was
 * certified — exactly what the client received — and never re-renders it;
 * a draft is rendered on demand and marked as a draft.
 */

export const runtime = "nodejs";

const DOCUMENTS_BUCKET = "underwriting-documents";

function pdfResponse(body: Uint8Array, fileName: string): Response {
  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const guard = await guardRoute(assertUnderwritingAccess);
  if (!guard.ok) return guard.response;

  const affidavit = await getAffidavitDetail(id);
  if (!affidavit) {
    return NextResponse.json({ error: "That affidavit no longer exists." }, { status: 404 });
  }
  const fileName = affidavitFileName(affidavit.report_identifier);

  if (affidavit.status === "certified") {
    // uw_affidavits_certified_document_check guarantees the path is set.
    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .download(affidavit.certified_document_path ?? "");
    if (error || !data) {
      console.error("Could not read the certified affidavit document:", error);
      return NextResponse.json(
        { error: "Could not load the certified document." },
        { status: 500 },
      );
    }
    return pdfResponse(new Uint8Array(await data.arrayBuffer()), fileName);
  }

  const pdf = await renderAffidavitPdf(affidavitPdfProps(affidavit, { certified: false }));
  return pdfResponse(new Uint8Array(pdf), `DRAFT ${fileName}`);
}
