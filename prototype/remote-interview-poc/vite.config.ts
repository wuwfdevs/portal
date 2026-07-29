import { defineConfig } from "vite";

// No proxy target hardcoded here — test/driver.ts builds the dev server
// in-process via vite's JS API and sets the proxy target to the backend's
// actual OS-assigned port at runtime, since neither port is known ahead of time.
export default defineConfig({
  root: "src/client",
  server: {
    port: 0,
  },
});
