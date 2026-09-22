// Stands in for the `server-only` package when the eval runs under plain
// Node (vitest.eval.config.ts aliases it here). The real package throws on
// import outside a React Server Components build, which is right for the
// app and wrong for a developer-run script that only ever runs on a
// machine. Empty on purpose.
export {};
