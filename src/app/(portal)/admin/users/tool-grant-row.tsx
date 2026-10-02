import { getRoleCatalog, rolesStack } from "@/lib/tool-roles";
import { controlClasses } from "@/components/ui/input";
import { cn } from "@/lib/cn";
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
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="tool_id"
            value={tool.id}
            defaultChecked={hasAccess}
            className="accent-brand-primary"
          />
          {tool.name}
        </label>
        {roleOptions && !stacks && (
          <select
            name={`tool_role_${tool.id}`}
            aria-label={`${tool.name} role`}
            defaultValue={roles[0] ?? ""}
            className={cn(controlClasses, "w-56 py-1")}
          >
            <option value="">No specific role (defaults to {roleOptions[0]!.label})</option>
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} — {option.description}
              </option>
            ))}
          </select>
        )}
      </div>
      {roleOptions && stacks && (
        <fieldset className="ml-6 flex flex-col gap-1.5">
          <legend className="sr-only">{tool.name} roles</legend>
          {roleOptions.map((option) => (
            <label key={option.value} className="flex items-start gap-2 text-sm text-ink-900">
              <input
                type="checkbox"
                name={`tool_roles_${tool.id}`}
                value={option.value}
                defaultChecked={current.has(option.value)}
                className="mt-1 accent-brand-primary"
              />
              <span>
                {option.label}
                <span className="block text-xs text-ink-500">{option.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
