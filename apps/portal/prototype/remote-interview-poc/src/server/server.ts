import http from "node:http";
import { handleRequest } from "./routes.ts";

export interface StartedServer {
  server: http.Server;
  port: number;
}

/** Starts on an OS-assigned port (listen(0)) so it never collides with
 * anything else running in this environment (e.g. the portal's own
 * `next dev` on 3000). */
export function startServer(): Promise<StartedServer> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      void handleRequest(req, res);
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("server did not bind a TCP port"));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

// Allow running standalone via `npm run dev:server` for manual poking.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { port } = await startServer();
  console.log(`remote-interview-poc backend listening on http://127.0.0.1:${port}`);
}
