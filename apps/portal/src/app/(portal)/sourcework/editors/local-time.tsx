"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

function format(iso: string, withDate: boolean): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (!withDate) return time;
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}, ${time}`;
}

/** A timestamp in the reader's own clock ("2:41 PM"); blank on the server so its zone never shows. */
export function LocalTime({ iso, withDate = false }: { iso: string; withDate?: boolean }) {
  const text = useSyncExternalStore(
    subscribe,
    () => format(iso, withDate),
    () => "",
  );
  return <time dateTime={iso}>{text}</time>;
}
