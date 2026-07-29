import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
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
