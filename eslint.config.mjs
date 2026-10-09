import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // CLAUDE.md: never discard a Supabase `error`. A read that falls back to empty and a write that
    // redirects as though it succeeded both render like a healthy screen, so an outage looks like a UI
    // bug. This catches the common shape — `const { data } = await ...` with no `error` beside it.
    // `const { data: { user } } = await supabase.auth.getUser()` is exempt: no user is just "signed out".
    // Genuine non-Supabase uses (a `data` field that is not a query result) take an inline disable.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "VariableDeclarator[init.type='AwaitExpression'][id.type='ObjectPattern']:has(Property[key.name='data']):not(:has(Property[key.name='error'])):not(:has(Property[key.name='data'][value.type='ObjectPattern']))",
          message:
            "This destructures `data` from an awaited call without `error`. If it is a Supabase query, check the error (unwrapRead / failIfError) — see docs/logic-patterns.md.",
        },
      ],
    },
  },
  {
    ignores: [
      "supabase/**",
      "src/lib/database.types.ts",
      ".next/**",
      "node_modules/**",
      "prototype/**",
    ],
  },
];

export default eslintConfig;
