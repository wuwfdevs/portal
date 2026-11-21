"use client";

import { RouteError } from "@/components/ui/route-error";

export default function NotificationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError toolName="Notifications" error={error} reset={reset} />;
}
