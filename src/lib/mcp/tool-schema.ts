// Pure helpers for turning a capability's own Zod input schema into the
// schema an MCP tool call actually validates against. See
// docs/agent-capabilities-design.md §5: a `confirmation: "required"`
// capability needs an explicit `confirmed: true` flag before
// registry.invoke() will run its handler — that flag is MCP-layer
// bookkeeping, never part of a capability's own domain schema, so it's
// added here rather than in src/lib/*/capabilities.ts.

import { z } from "zod";
import type { AnyCapability } from "@/lib/capabilities/registry";

const CONFIRMED_FIELD = {
  confirmed: z
    .boolean()
    .optional()
    .describe(
      "Must be true to run this capability. Show the user the pending action and get an explicit yes before setting it.",
    ),
};

/**
 * The schema exposed to an MCP client for one capability's tool. Every
 * capability's `input` is either a `z.object(...)` or a
 * `z.discriminatedUnion(...)` of objects (log.rundownItem.recordOutcome's
 * aired/missed shape is the one discriminated-union case today) — this is a
 * runtime assertion rather than a type constraint so a future input shape
 * that's neither fails loudly here instead of silently shipping a
 * confirmation-required tool with no way to confirm it.
 */
export function toolInputSchema(
  capability: Pick<AnyCapability, "input" | "confirmation">,
): z.ZodType {
  if (capability.confirmation !== "required") return capability.input;
  if (capability.input instanceof z.ZodObject) {
    return capability.input.extend(CONFIRMED_FIELD);
  }
  if (capability.input instanceof z.ZodDiscriminatedUnion) {
    // Every branch of a discriminated-union capability input is itself a
    // z.object(...) in practice (checked across all capabilities.ts files,
    // same assumption the object case above makes) — the union's own type
    // parameters don't carry that through, so this narrows back to it.
    const options = capability.input.options as readonly z.ZodObject<z.ZodRawShape>[];
    const [first, ...rest] = options.map((option) => option.extend(CONFIRMED_FIELD));
    if (!first) {
      throw new Error("MCP tool wrapping found a discriminated union with no branches.");
    }
    return z.discriminatedUnion(capability.input.def.discriminator, [first, ...rest]);
  }
  throw new Error(
    "MCP tool wrapping requires an object or discriminated-union input schema to add a `confirmed` field.",
  );
}

/** Splits one MCP tool call's validated args into the capability's own input and the confirmation flag. */
export function splitConfirmed(args: Record<string, unknown>): {
  input: Record<string, unknown>;
  confirmed: boolean;
} {
  const { confirmed, ...input } = args;
  return { input, confirmed: confirmed === true };
}
