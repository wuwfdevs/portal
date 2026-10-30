import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { startServer, type StartedServer } from "../src/server/server.ts";

export interface Harness {
  page: Page;
  origin: string;
  backendPort: number;
}

/**
 * Boots the Node backend on an OS-assigned port, a Vite dev server proxying
 * /api to it, and headless Chromium with a synthetic fake audio device (no
 * real microphone needed) plus auto-granted mic permission. Runs `fn`, then
 * tears everything down regardless of outcome.
 */
export async function withHarness<T>(
  fn: (h: Harness) => Promise<T>,
  opts: { fakeAudioFile?: string } = {},
): Promise<T> {
  const backend: StartedServer = await startServer();

  const vite: ViteDevServer = await createServer({
    configFile: new URL("../vite.config.ts", import.meta.url).pathname,
    server: {
      proxy: {
        "/api": `http://127.0.0.1:${backend.port}`,
      },
    },
  });
  await vite.listen();
  const address = vite.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("vite did not bind a port");
  const origin = `http://127.0.0.1:${address.port}`;

  const args = [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--no-sandbox",
    "--disable-dev-shm-usage",
  ];
  if (opts.fakeAudioFile) {
    args.push(`--use-file-for-fake-audio-capture=${opts.fakeAudioFile}`);
  }

  const browser: Browser = await chromium.launch({ headless: true, args });
  let context: BrowserContext | null = null;

  try {
    context = await browser.newContext();
    await context.grantPermissions(["microphone"], { origin });
    const page = await context.newPage();
    page.on("console", (msg) => console.log(`[page] ${msg.text()}`));
    page.on("pageerror", (err) => console.error(`[page error] ${err}`));

    await page.goto(origin);
    await page.waitForFunction(() => "__poc" in window);

    return await fn({ page, origin, backendPort: backend.port });
  } finally {
    await context?.close();
    await browser.close();
    await vite.close();
    backend.server.close();
  }
}
