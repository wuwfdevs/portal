// Pure helpers for turning a capability's own Zod input schema into the
// schema an MCP tool call actually validates against. See
// docs/agent-capabilities-design.md §5: a `confirmation: "required"`
// capability needs an explicit `confirmed: true` flag before
// registry.invoke() will run its handler — that flag is MCP-layer
// bookkeeping, never part of a capability's own domain schema, so it's
// added here rather than in src/lib/*/capabilities.ts.

import { z } from "zod";
import type { AnyCapability } from "@/lib/capabilities/registry";

/**
 * The schema exposed to an MCP client for one capability's tool. Every
 * capability's `input` is a `z.object(...)` today (checked across all four
 * tools' capabilities.ts files) — this is a runtime assertion rather than a
 * type constraint so a future non-object input schema fails loudly here
 * instead of silently shipping a confirmation-required tool with no way to
 * confirm it.
 */
export function toolInputSchema(
  capability: Pick<AnyCapability, "input" | "confirmation">,
): z.ZodType {
  if (capability.confirmation !== "required") return capability.input;
  if (!(capability.input instanceof z.ZodObject)) {
    throw new Error(
      "MCP tool wrapping requires an object input schema to add a `confirmed` field.",
    );
  }
  return capability.input.extend({
    confirmed: z
      .boolean()
      .optional()
      .describe(
        "Must be true to run this capability. Show the user the pending action and get an explicit yes before setting it.",
      ),
  });
}

/** Splits one MCP tool call's validated args into the capability's own input and the confirmation flag. */
export function splitConfirmed(args: Record<string, unknown>): {
  input: Record<string, unknown>;
  confirmed: boolean;
} {
  const { confirmed, ...input } = args;
  return { input, confirmed: confirmed === true };
}
