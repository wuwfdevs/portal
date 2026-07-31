import "server-only";
import type { z } from "zod";
import type { createClient } from "@/lib/supabase/server";

// See docs/agent-capabilities-design.md §4. A capability is a reusable,
// server-side application operation — the same shape whether it's called
// from a Server Action adapter, an MCP tool handler, or a test. It never
// redirects and never takes FormData; those are concerns of the caller.

export type CapabilityConfirmation = "none" | "required";

export interface CapabilityRequires {
  /** A `tools.key` value — the tool this capability belongs to. */
  tool: string;
  /**
   * Metadata for discovery/UI only (what an MCP tool description says, what
   * an agent can offer a given user) — never the sole authorization check.
   * The handler must still assert real access itself; see the design doc's
   * §4 and §11 risk 1.
   */
  role?: string;
}

export interface CapabilityContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
}

export interface CapabilityDefinition<Input, Output> {
  /** Dotted id, e.g. "editorial.pitch.archive". Stable — MCP tool names key off it. */
  id: string;
  /** One sentence, human-readable — becomes an MCP tool's description. */
  summary: string;
  input: z.ZodType<Input>;
  requires: CapabilityRequires;
  confirmation: CapabilityConfirmation;
  handler: (ctx: CapabilityContext, input: Input) => Promise<Output>;
}

/** Identity function with a name — gives capability definitions a single, typed shape. */
export function defineCapability<Input, Output>(
  definition: CapabilityDefinition<Input, Output>,
): CapabilityDefinition<Input, Output> {
  return definition;
}
