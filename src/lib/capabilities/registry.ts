import "server-only";
import { createClient } from "@/lib/supabase/server";
import * as editorialCapabilities from "@/lib/editorial/capabilities";
import * as transcriptionCapabilities from "@/lib/transcription/capabilities";
import * as remoteInterviewCapabilities from "@/lib/remote-interview/capabilities";
import * as audienceListeningCapabilities from "@/lib/audience-listening/capabilities";
import * as roadmapCapabilities from "@/lib/roadmap/capabilities";
import * as logCapabilities from "@/lib/log/capabilities";
import * as underwritingCapabilities from "@/lib/underwriting/capabilities";
import type { CapabilityDefinition } from "./define";

// The one place all of a tool's capabilities are aggregated — the thing an
// MCP server and, later, the portal agent import from (see design doc §4).
// Phase A (docs/agent-capabilities-design.md §10) populated Editorial
// Planning's entries; Phase B adds one high-value capability per remaining
// tool (Sourcework project search, Remote Interview session create,
// Audience Listening's send-to-Sourcework handoff) so the registry has real
// entries from all four tools before anything (Phase C's MCP server) reads
// from it.

// A capability's Input/Output are specific to itself; the registry only
// needs to move them around, not know their shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCapability = CapabilityDefinition<any, any>;

const CAPABILITY_MODULES = [
  editorialCapabilities,
  transcriptionCapabilities,
  remoteInterviewCapabilities,
  audienceListeningCapabilities,
  roadmapCapabilities,
  logCapabilities,
  underwritingCapabilities,
];

const ALL_CAPABILITIES: AnyCapability[] = CAPABILITY_MODULES.flatMap((module) =>
  Object.values(module).filter(
    (value): value is AnyCapability =>
      typeof value === "object" && value !== null && "id" in value && "handler" in value,
  ),
);

const REGISTRY = new Map<string, AnyCapability>(
  ALL_CAPABILITIES.map((capability) => [capability.id, capability]),
);

if (REGISTRY.size !== ALL_CAPABILITIES.length) {
  throw new Error("Duplicate capability id registered — every capability id must be unique.");
}

export function listCapabilities(): AnyCapability[] {
  return Array.from(REGISTRY.values());
}

export function getCapability(id: string): AnyCapability | undefined {
  return REGISTRY.get(id);
}

export class CapabilityNotFoundError extends Error {
  constructor(id: string) {
    super(`No capability registered with id "${id}".`);
    this.name = "CapabilityNotFoundError";
  }
}

export class CapabilityConfirmationRequiredError extends Error {
  constructor(id: string) {
    super(`Capability "${id}" requires explicit confirmation before it can run.`);
    this.name = "CapabilityConfirmationRequiredError";
  }
}

export interface InvokeOptions {
  /**
   * Must be explicitly true to run a `confirmation: "required"` capability.
   * The portal agent's UI must have shown the pending action and gotten an
   * explicit yes before setting this; an external MCP client must surface
   * its own confirmation UI first. See design doc §5 and §11 risk 2 — this
   * is enforced here, not left as a convention the caller is trusted to honor.
   */
  confirmed?: boolean;
}

/**
 * The one entry point every caller (Server Action adapter, MCP tool handler,
 * future agent) uses to run a capability by id. `rawInput` is parsed against
 * the capability's own schema, so a caller with untyped input (an MCP tool
 * call, an agent's tool use) gets the same validation a typed call gets.
 */
export async function invoke<Output = unknown>(
  id: string,
  rawInput: unknown,
  options: InvokeOptions = {},
): Promise<Output> {
  const capability = getCapability(id);
  if (!capability) throw new CapabilityNotFoundError(id);
  if (capability.confirmation === "required" && options.confirmed !== true) {
    throw new CapabilityConfirmationRequiredError(id);
  }
  const input = capability.input.parse(rawInput);
  const supabase = await createClient();
  return capability.handler({ supabase }, input) as Promise<Output>;
}

/**
 * Type-safe alternative to `invoke(id, input)` for callers that already hold
 * a capability reference (every in-repo Server Action adapter) — same
 * confirmation enforcement, but the input/output types come from the
 * capability itself instead of a generic parameter.
 */
export async function invokeCapability<Input, Output>(
  capability: CapabilityDefinition<Input, Output>,
  rawInput: unknown,
  options: InvokeOptions = {},
): Promise<Output> {
  return invoke<Output>(capability.id, rawInput, options);
}
