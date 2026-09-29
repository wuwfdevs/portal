import { redirect } from "next/navigation";

/**
 * There is no clocks list: nobody starts from a clock, so Programs is the one
 * entry point and a clock is reached from the program that airs on it. Kept as
 * a redirect for bookmarks and old links; a clock's own page still lives at
 * /log/clocks/[id].
 */
export default function ClocksIndexPage(): never {
  redirect("/log/programs");
}
