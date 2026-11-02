import { redirect } from "next/navigation";

// Station IDs are pinned on each clock's page, like any other pinned content;
// the separate list this route used to show is gone (CLAUDE.md, "Station IDs
// are pinned on the clock page"). Old links land on Programs.
export default function StationIdsPage() {
  redirect("/log/programs");
}
