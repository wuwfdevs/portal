// Runs the program-log importer against real exports with the live model —
// `npm run eval:program-log` (see scripts/program-log-eval/README.md). Kept
// out of `npm test` on purpose: it needs OPENAI_API_KEY and a Supabase
// secret key, takes minutes, and costs money. The `server-only` alias is
// what lets a plain Node process import this repo's `"server-only"`
// modules: the real package throws outside a React Server Components
// build, and vitest resolves node_modules natively, so an export
// condition can't redirect it — an alias to an empty module can.
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/program-log-eval/**/*.eval.ts"],
    testTimeout: 15 * 60 * 1000,
    hookTimeout: 5 * 60 * 1000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./scripts/program-log-eval/server-only-stub.ts"),
    },
  },
});
