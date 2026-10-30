import { getRoleCatalog, rolesStack } from "@/lib/tool-roles";
import { CheckboxField, Select } from "@/components/ui/input";
import type { Tool } from "@/lib/tools";

/**
 * One tool on the invite and edit-access forms: the grant checkbox, then
 * either a dropdown (a tool with one role per person) or a checkbox per role
 * (a tool whose roles stack — docs/broadcast-roles.md). Both post into
 * lib/tool-roles.ts's parseToolGrants().
 */
export function ToolGrantRow({
  tool,
  hasAccess,
  roles,
}: {
  tool: Pick<Tool, "id" | "key" | "name">;
  hasAccess: boolean;
  roles: readonly string[];
}) {
  const roleOptions = getRoleCatalog(tool.key);
  const stacks = rolesStack(tool.key);
  const current = new Set(roles.map((role) => role.toLowerCase()));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5 text-sm text-ink-900">
        <CheckboxField
          name="tool_id"
          value={tool.id}
          defaultChecked={hasAccess}
          className="items-center text-ink-900"
          label={tool.name}
        />
        {roleOptions && !stacks && (
          <Select
            name={`tool_role_${tool.id}`}
            aria-label={`${tool.name} role`}
            defaultValue={roles[0] ?? ""}
            className="w-56 py-1"
          >
            <option value="">No specific role (defaults to {roleOptions[0]!.label})</option>
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} — {option.description}
              </option>
            ))}
          </Select>
        )}
      </div>
      {roleOptions && stacks && (
        <fieldset className="ml-6 flex flex-col gap-1.5">
          <legend className="sr-only">{tool.name} roles</legend>
          {roleOptions.map((option) => (
            <CheckboxField
              key={option.value}
              name={`tool_roles_${tool.id}`}
              value={option.value}
              defaultChecked={current.has(option.value)}
              className="text-ink-900"
              label={option.label}
              hint={option.description}
            />
          ))}
        </fieldset>
      )}
    </div>
  );
}
