import { redirect } from "next/navigation";
import { RATES_PATH } from "@/lib/bookings/paths";

// The dashboard (docs/bookings-design.md §6) arrives with the projects
// slice; until then the tool opens on the rate model, its only screen.
export default function BookingsPage() {
  redirect(RATES_PATH);
}
