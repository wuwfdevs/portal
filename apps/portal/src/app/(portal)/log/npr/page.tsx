import { redirect } from "next/navigation";

// NPR moved under the Sources tab (/log/sources/npr); keep old links working.
export default async function NprRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  const query = params.toString();
  redirect(query ? `/log/sources/npr?${query}` : "/log/sources/npr");
}
