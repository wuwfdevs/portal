import { redirect } from "next/navigation";
import { ratesHref } from "@/lib/bookings/paths";

/**
 * /bookings/rates lands on the Rate card — the output people came for. The
 * Assumptions editor that used to live here is at /bookings/rates/assumptions.
 */
export default async function RatesIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string; error?: string }>;
}) {
  const params = await searchParams;
  redirect(ratesHref("card", params.version ?? null, params.error ? { error: params.error } : {}));
}
