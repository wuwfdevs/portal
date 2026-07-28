"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 5000;

/**
 * Refreshes the workspace while transcription is running, so the transcript
 * appears on its own when the ASR webhook lands. Without it the page sits on
 * "Transcribing…" until someone thinks to reload, which makes a pipeline
 * that worked look like one that hung.
 *
 * Polling rather than a realtime subscription is the design's explicit call
 * (§6): this is a status that changes once, and it isn't worth standing up
 * realtime infrastructure for.
 */
export function ProcessingPoller() {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router]);

  return null;
}
