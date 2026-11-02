import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOOL_ROLE_SPECS } from "./tool-roles";

/**
 * The admin access screen offers a tool's roles from its ROLE_SPEC. A tool's roles live in four
 * places that nothing forces into agreement (the TypeScript parser, the SQL predicate, the screen's
 * catalog, and the role's own words); sql-twins.test.ts pairs the first two. This pairs the others:
 * a tool whose roles.ts defines roles but never reached the screen once left Academic Partnerships'
 * coordinator impossible to grant.
 */
const root = process.cwd();
const libDir = join(root, "src/lib");
const toolRolesSource = readFileSync(join(libDir, "tool-roles.ts"), "utf8");
const migrations = readdirSync(join(root, "supabase/migrations"))
  .filter((name) => name.endsWith(".sql"))
  .map((name) => readFileSync(join(root, "supabase/migrations", name), "utf8"))
  .join("\n");

const toolDirsWithRoles = readdirSync(libDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(libDir, entry.name, "roles.ts")))
  .map((entry) => entry.name);

describe("every tool's roles.ts reaches the admin access screen", () => {
  for (const dir of toolDirsWithRoles) {
    it(`src/lib/${dir}/roles.ts exports a ROLE_SPEC that tool-roles.ts gathers`, () => {
      const source = readFileSync(join(libDir, dir, "roles.ts"), "utf8");
      expect(source).toMatch(/export const ROLE_SPEC\b/);
      expect(toolRolesSource).toContain(`from "@/lib/${dir}/roles"`);
    });
  }

  it("finds the tool role files it is meant to check", () => {
    expect(toolDirsWithRoles.length).toBeGreaterThanOrEqual(9);
  });
});

describe("TOOL_ROLE_SPECS", () => {
  it("has one spec per tool key", () => {
    const keys = TOOL_ROLE_SPECS.map((spec) => spec.toolKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  for (const spec of TOOL_ROLE_SPECS) {
    describe(spec.toolKey, () => {
      it("names a tool the registry knows", () => {
        expect(migrations).toContain(`'${spec.toolKey}'`);
      });

      it("describes its base access and every role it offers", () => {
        expect(spec.baseAccess.trim()).not.toBe("");
        expect(spec.roles.length).toBeGreaterThan(0);
        for (const role of spec.roles) {
          expect(role.label.trim()).not.toBe("");
          expect(role.description.trim()).not.toBe("");
        }
      });

      it("keeps role values lowercase and unique, as the tool_access trigger stores them", () => {
        const values = spec.roles.map((role) => role.value);
        expect(values.every((value) => value === value.trim().toLowerCase())).toBe(true);
        expect(new Set(values).size).toBe(values.length);
      });

      if (spec.kind === "ranked") {
        it("offers a ladder: at least two levels", () => {
          expect(spec.roles.length).toBeGreaterThanOrEqual(2);
        });
      }
    });
  }
});
