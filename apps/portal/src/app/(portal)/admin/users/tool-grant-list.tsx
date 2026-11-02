import { grantRequiredForTool } from "@/lib/tool-access-rules";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import type { Tool } from "@/lib/tools";
import { ToolGrantRow } from "./tool-grant-row";

type GrantTool = Pick<Tool, "id" | "key" | "name" | "status" | "default_access">;

/**
 * The "Authorized tools" block of the invite and edit-access forms: a short key to the three
 * ways a tool's roles work, then the invite-only tools (the box lets someone open the tool),
 * then the tools open to every active user (a role there only adds to what everyone has).
 * `rolesByToolId` holds the roles of each active grant; a tool with no entry has no grant.
 */
export function ToolGrantList({
  tools,
  rolesByToolId,
}: {
  tools: readonly GrantTool[];
  rolesByToolId: ReadonlyMap<string, readonly string[]>;
}) {
  const inviteOnly = tools.filter((tool) => grantRequiredForTool(tool));
  const open = tools.filter((tool) => !grantRequiredForTool(tool));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label>Authorized tools</Label>
        <p className="text-meta text-ink-500">
          Each tool shows what the box gives, then the roles that go further. The tag says how its
          roles work.
        </p>
      </div>

      <dl className="grid gap-3 rounded border border-line bg-white px-4 py-3.5 sm:grid-cols-3">
        <KeyItem tag="Access only">Checking the box is all there is. No separate roles.</KeyItem>
        <KeyItem tag="One level">Pick one. Each level includes the ones before it.</KeyItem>
        <KeyItem tag="Roles combine">Add any that apply. None includes another.</KeyItem>
      </dl>

      {inviteOnly.length > 0 && (
        <ToolGroup
          title="Invite-only tools"
          hint="The box lets this person open the tool. Without it they cannot see it."
        >
          {inviteOnly.map((tool) => (
            <ToolGrantRow
              key={tool.id}
              tool={tool}
              hasAccess={rolesByToolId.has(tool.id)}
              roles={rolesByToolId.get(tool.id) ?? []}
            />
          ))}
        </ToolGroup>
      )}

      {open.length > 0 && (
        <ToolGroup
          title="Open to all staff"
          hint="No grant is needed to use these. Add a role only to give this person more."
        >
          {open.map((tool) => (
            <ToolGrantRow
              key={tool.id}
              tool={tool}
              hasAccess={rolesByToolId.has(tool.id)}
              roles={rolesByToolId.get(tool.id) ?? []}
            />
          ))}
        </ToolGroup>
      )}
    </div>
  );
}

function KeyItem({ tag, children }: { tag: string; children: string }) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <dt>
        <Badge variant="neutral">{tag}</Badge>
      </dt>
      <dd className="text-meta text-ink-500">{children}</dd>
    </div>
  );
}

function ToolGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <SectionHeading level="eyebrow" as="h3">
          {title}
        </SectionHeading>
        <p className="text-meta text-ink-500">{hint}</p>
      </div>
      <div className="divide-y divide-line rounded border border-line bg-white">{children}</div>
    </section>
  );
}
