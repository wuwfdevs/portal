import { getRoleSpec, type ToolRoleSpec } from "@/lib/tool-roles";
import { grantRequiredForTool } from "@/lib/tool-access-rules";
import { Badge } from "@/components/ui/badge";
import { ChoiceCards } from "@/components/ui/choice-cards";
import { CheckboxField } from "@/components/ui/input";
import type { Tool } from "@/lib/tools";

/**
 * One tool on the invite and edit-access forms. Every tool leads the same way: its name, a tag
 * for how its roles work, then what a person can do with no role. Below that, the roles:
 *
 *   - a tool with no roles is access only, and the checkbox is all there is;
 *   - a ranked tool offers radio cards, one level per person (`tool_role_<id>`);
 *   - a stacking tool offers a checkbox per role (`tool_roles_<id>`).
 *
 * An invite-only tool starts with its access checkbox, and its roles stay hidden until that is
 * checked. A tool open to every active user has no checkbox, because everyone is already in; a
 * role there only adds to that. Both post into lib/tool-roles.ts's parseToolGrants().
 */
export function ToolGrantRow({
  tool,
  hasAccess,
  roles,
}: {
  tool: Pick<Tool, "id" | "key" | "name" | "status" | "default_access">;
  hasAccess: boolean;
  roles: readonly string[];
}) {
  const spec = getRoleSpec(tool.key);
  const open = !grantRequiredForTool(tool);

  return (
    <div className="group px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {open ? (
          <span className="min-w-0 flex-1 py-2 text-body font-semibold text-ink-900">
            {tool.name}
          </span>
        ) : (
          <CheckboxField
            name="tool_id"
            value={tool.id}
            defaultChecked={hasAccess}
            data-grant
            className="min-w-0 flex-1 items-center py-2 text-body font-semibold text-ink-900"
            label={tool.name}
          />
        )}
        {open ? (
          <Badge variant="accent" title="No grant is needed to use this tool">
            Everyone has access
          </Badge>
        ) : (
          <Badge variant="neutral">{kindLabel(spec)}</Badge>
        )}
      </div>
      <p className={open ? "text-meta text-ink-500" : "ml-6 text-meta text-ink-500"}>
        {spec?.baseAccess ?? "Opens the tool. No separate roles."}
      </p>
      {spec && !open && (
        <p className="ml-6 hidden text-meta text-ink-500 group-has-[[data-grant]:not(:checked)]:block">
          Check the box to choose their roles.
        </p>
      )}
      {spec && (
        <div
          className={
            // Unchecked: the roles would be ignored, so they are hidden. Where :has() is missing the
            // section simply stays visible.
            open ? "mt-3" : "ml-6 mt-3 group-has-[[data-grant]:not(:checked)]:hidden"
          }
        >
          <RolePicker tool={tool} spec={spec} roles={roles} open={open} />
        </div>
      )}
    </div>
  );
}

function kindLabel(spec: ToolRoleSpec | null): string {
  if (!spec) return "Access only";
  return spec.kind === "ranked" ? "One level" : "Roles combine";
}

function RolePicker({
  tool,
  spec,
  roles,
  open,
}: {
  tool: Pick<Tool, "id" | "name">;
  spec: ToolRoleSpec;
  roles: readonly string[];
  open: boolean;
}) {
  const current = new Set(roles.map((role) => role.toLowerCase()));

  if (spec.kind === "ranked") {
    const held = spec.roles.find((option) => current.has(option.value));
    return (
      <fieldset className="flex flex-col gap-2.5 rounded border border-line bg-panel-50 px-4 py-3.5">
        <legend className="sr-only">{tool.name} level</legend>
        <p className="text-label font-bold uppercase tracking-wide text-ink-500" aria-hidden>
          Level · pick one
        </p>
        <ChoiceCards
          name={`tool_role_${tool.id}`}
          columns={3}
          defaultValue={(held ?? spec.roles[0])?.value}
          options={spec.roles.map((option) => ({
            value: option.value,
            title: option.label,
            description: option.description,
          }))}
        />
      </fieldset>
    );
  }

  const single = spec.roles.length === 1;
  const heading = open
    ? single
      ? "Extra role · add if it applies"
      : "Extra roles · add any that apply"
    : single
      ? "Role · add if it applies"
      : "Roles · add any that apply";
  return (
    <fieldset className="flex flex-col gap-1.5 rounded border border-line bg-panel-50 px-4 py-3.5">
      <legend className="sr-only">{tool.name} roles</legend>
      <p className="text-label font-bold uppercase tracking-wide text-ink-500" aria-hidden>
        {heading}
      </p>
      <div className="grid gap-x-5 gap-y-1.5 sm:grid-cols-2">
        {spec.roles.map((option) => (
          <CheckboxField
            key={option.value}
            name={`tool_roles_${tool.id}`}
            value={option.value}
            defaultChecked={current.has(option.value)}
            className="py-1 text-ink-900"
            label={<span className="font-semibold">{option.label}</span>}
            hint={option.description}
          />
        ))}
      </div>
    </fieldset>
  );
}
