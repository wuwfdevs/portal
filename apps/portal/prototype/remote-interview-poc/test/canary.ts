/**
 * Task 3 go/no-go gate: does extendable-media-recorder's WAV encoder
 * register and report itself supported under this Vite + headless-Chromium
 * pairing? If this fails, stop and reconsider before building OPFS/upload/
 * assembly on top of a broken foundation (see the technical assessment's
 * AudioWorklet fallback).
 */
import { chromium } from "playwright";
import { createServer } from "vite";

async function main(): Promise<void> {
  const vite = await createServer({
    configFile: new URL("../vite.config.ts", import.meta.url).pathname,
    server: { port: 0 },
  });
  await vite.listen();
  const address = vite.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("vite did not bind a port");
  const origin = `http://127.0.0.1:${address.port}`;
  console.log(`vite dev server: ${origin}`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  try {
    const context = await browser.newContext();
    await context.grantPermissions(["microphone"], { origin });
    const page = await context.newPage();
    page.on("console", (msg) => console.log(`[page] ${msg.text()}`));
    page.on("pageerror", (err) => console.error(`[page error] ${err}`));

    await page.goto(origin);
    await page.waitForFunction(() => "__poc" in window);

    const result = await page.evaluate(() => window.__poc.runCanary());
    console.log("canary result:", result);

    if (!result.ok) {
      console.error("FAIL: canary did not pass");
      process.exitCode = 1;
      return;
    }
    console.log("PASS: WAV encoder registers and is supported");
  } finally {
    await browser.close();
    await vite.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
