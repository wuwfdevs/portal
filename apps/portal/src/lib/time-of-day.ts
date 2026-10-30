/**
 * A time of day as text ("HH:MM" or "HH:MM:SS", a Postgres `time` column or a
 * form value) and as minutes since midnight. Wall-clock only: whose clock it
 * is (the station's) is decided where the value was produced.
 */

/** Minutes since midnight; a missing minute part counts as 0, anything unreadable is NaN. */
export function parseTimeToMinutes(time: string): number {
  const [hour, minute = "0"] = time.trim().split(":");
  if (hour === undefined || hour === "") return Number.NaN;
  return Number(hour) * 60 + Number(minute);
}

/** Minutes since midnight as "HH:MM" (24-hour). */
export function minutesToHHMM(minutes: number): string {
  const whole = Math.floor(minutes);
  const hour = Math.floor(whole / 60);
  return `${String(hour).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}
