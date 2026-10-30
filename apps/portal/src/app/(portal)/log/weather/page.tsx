import { redirect } from "next/navigation";

// Weather moved under the Sources tab (/log/sources/weather); keep old links working.
export default function WeatherRedirect() {
  redirect("/log/sources/weather");
}
