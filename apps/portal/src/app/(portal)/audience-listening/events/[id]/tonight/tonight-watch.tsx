"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { usePoller } from "@/lib/use-poller";
import { touchConsole } from "../../../conversation-actions";

/** How often the console checks in and the page refreshes. Under the minute a table's phone allows before it stops saying help is coming. */
const CHECK_IN_MS = 15_000;

/** A short two-note tone. Needs a sound context the person started with a click; browsers do not allow one to start itself. */
function beep(context: AudioContext) {
  const now = context.currentTime;
  [880, 660].forEach((frequency, i) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now + i * 0.22);
    gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.22 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.22 + 0.2);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now + i * 0.22);
    oscillator.stop(now + i * 0.22 + 0.22);
  });
}

/**
 * The staff console's heartbeat and its alert. Every few seconds it checks in (which is what lets a table's phone say "help is
 * coming") and refreshes the page; when a new request for a hand appears it sounds a tone, once sound has been turned on, because
 * a request has to reach someone in the room and a silent screen across the room does not.
 */
export function TonightWatch({ eventId, helpCount }: { eventId: string; helpCount: number }) {
  const [sound, setSound] = useState(false);
  const context = useRef<AudioContext | null>(null);
  const previous = useRef(helpCount);

  usePoller({ intervalMs: CHECK_IN_MS, immediate: true, task: () => touchConsole(eventId) });

  useEffect(() => {
    if (helpCount > previous.current && sound && context.current) beep(context.current);
    previous.current = helpCount;
  }, [helpCount, sound]);

  function toggleSound() {
    if (!sound) {
      context.current ??= new AudioContext();
      void context.current.resume();
      beep(context.current);
    }
    setSound((on) => !on);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant={sound ? "primary" : "secondary"} onClick={toggleSound}>
        {sound ? "Sound is on" : "Turn sound on"}
      </Button>
      <p className="text-xs text-ink-400">
        This page checks in every {CHECK_IN_MS / 1000} seconds. Tables are told help is coming only while it is open.
      </p>
    </div>
  );
}
