import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ForbiddenError } from "@/lib/auth/authz";
import { assertLogAccess } from "@/lib/log/access";
import { isValidDateISO } from "@/lib/log/week-layout";

/**
 * A released DAD log, as the file DAD imports. A route handler rather than
 * a Server Action because the result is a file, not data (same reason as
 * the affidavit PDF). Serves the stored file of the version asked for
 * (`?version=N`), or the latest — never a rebuild, so what's downloaded is
 * exactly what was released.
 */

export const runtime = "nodejs";

const EXPORTS_BUCKET = "log-exports";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ date: string }> },
): Promise<Response> {
  const { date } = await params;
  if (!isValidDateISO(date)) {
    return NextResponse.json({ error: "That isn't a date." }, { status: 400 });
  }

  try {
    await assertLogAccess();
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const versionParam = new URL(request.url).searchParams.get("version");
  const supabase = await createClient();
  let query = supabase.from("log_dad_exports").select("*").eq("air_date", date);
  query =
    versionParam && /^\d+$/.test(versionParam)
      ? query.eq("version", Number(versionParam))
      : query.order("version", { ascending: false }).limit(1);
  const { data: rows, error } = await query;
  if (error) {
    console.error("Could not read the DAD log releases:", error);
    return NextResponse.json({ error: "Could not load the release." }, { status: 500 });
  }
  const release = rows?.[0];
  if (!release) {
    return NextResponse.json({ error: "That day hasn't been released." }, { status: 404 });
  }

  const { data: file, error: downloadError } = await supabase.storage
    .from(EXPORTS_BUCKET)
    .download(release.file_path);
  if (downloadError || !file) {
    console.error("Could not read the released DAD log:", downloadError);
    return NextResponse.json({ error: "Could not load the file." }, { status: 500 });
  }

  return new Response(new Uint8Array(await file.arrayBuffer()) as BodyInit, {
    headers: {
      "Content-Type": "text/plain; charset=us-ascii",
      "Content-Disposition": `attachment; filename="${release.file_name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
