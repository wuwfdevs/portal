import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";

export default async function RootPage() {
  const profile = await getCurrentProfile();
  redirect(profile ? "/dashboard" : "/login");
}
