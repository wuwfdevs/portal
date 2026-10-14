import { cn } from "@/lib/cn";
import type { ComponentProps } from "react";

/**
 * A row of boxed controls — buttons, links styled as buttons, selects, menu
 * triggers (docs/ui-patterns.md, "Control rows on a phone"). From `sm` up the
 * controls keep their natural width and sit where the caller puts them; below
 * `sm` the rule in `globals.css` (`.control-row`) takes over:
 *
 * - two controls share the row at half width each, with no spacer between;
 * - a child marked `data-row="fixed"` (an icon-only ⋮ or ×) keeps its square
 *   and the other control takes the rest;
 * - a child marked `data-row="full"` (a search box) takes its own row;
 * - a child marked `data-row="skip"` is hidden (a desktop-only spacer);
 * - three or more stretching controls pair up two to a row; with an odd count
 *   the last one — the primary action by the portal's own convention — takes
 *   the last row alone;
 * - a hidden input is not a control and is never counted;
 * - a row with any stretching control spans its container (so beside a title
 *   it wraps underneath); a row of only fixed controls — a lone ⋮ — keeps its
 *   own width and stays on the title's line.
 *
 * `Button`, `PrimaryLink`, `SecondaryLink`, `Select` and `ListSearch` need no
 * marking, and `ActionMenu` marks its own ⋮ trigger. Use `CONTROL_ROW` on an
 * element that can't be this component (a `<form>` footer).
 */
export const CONTROL_ROW = "control-row flex flex-wrap items-center gap-2";

export function ControlRow({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn(CONTROL_ROW, className)} {...props} />;
}
