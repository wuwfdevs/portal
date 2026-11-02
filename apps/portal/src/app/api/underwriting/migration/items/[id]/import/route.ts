import { NextResponse } from "next/server";
import { assertAgreementMigrationAccess } from "@/lib/underwriting/access";
import { runMigrationItem } from "@/lib/underwriting/migration-import";

/**
 * Imports one legacy-migration entry with its document (multipart field
 * `document`) and answers with the entry's MigrationRunResult as JSON. A
 * route handler rather than a Server Action because the migration screen
 * sends several of these at once, and Next.js runs one page's Server
 * Actions strictly one after another (docs/underwriting-traffic-redesign.md
 * §14.5). Same cookie session and RLS as every page.
 */

export const runtime = "nodejs";
// Each request is one model reading of a whole agreement packet.
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  let context;
  try {
    context = await assertAgreementMigrationAccess();
  } catch (error) {
    return NextResponse.json(
      { ok: false, status: "failed", error: (error as Error).message },
      { status: 403 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, status: "failed", error: "The document didn't arrive — choose it again." },
      { status: 400 },
    );
  }

  const result = await runMigrationItem(context, id, formData.get("document"));
  return NextResponse.json(result);
}
