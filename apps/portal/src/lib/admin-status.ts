// Status -> {label, variant} maps for the admin screens' badges, rendered with
// StatusBadge (components/ui/status-badge).

import { defineStatusMap } from "@/components/ui/status-badge";
import type { AccountStatus, ToolStatus } from "@/lib/database.types";

export const ACCOUNT_STATUS = defineStatusMap<AccountStatus>({
  active: { label: "Active", variant: "accent" },
  invited: { label: "Invited", variant: "neutral" },
  pending: { label: "Pending", variant: "neutral" },
  disabled: { label: "Disabled", variant: "muted" },
});

export const TOOL_STATUS = defineStatusMap<ToolStatus>({
  available: { label: "Available", variant: "accent" },
  in_development: { label: "In development", variant: "neutral" },
  planned: { label: "Planned", variant: "muted" },
  proposed: { label: "Proposed", variant: "muted" },
});
