/**
 * Task 4: empirically confirm or refute the claim (from an upstream
 * extendable-media-recorder GitHub issue) that only the first dataavailable
 * blob carries a full RIFF/WAVE header and later chunks are headerless PCM.
 * Feeds a real synthesized tone via --use-file-for-fake-audio-capture so the
 * chunks contain actual signal, not silence.
 */
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

async function main(): Promise<void> {
  const vite = await createServer({
    configFile: new URL("../vite.config.ts", import.meta.url).pathname,
  });
  await vite.listen();
  const address = vite.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("vite did not bind a port");
  const origin = `http://127.0.0.1:${address.port}`;

  const tonePath = path.resolve(import.meta.dirname, "tone.wav");
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${tonePath}`,
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

    console.log("recording 15s with a 5s timeslice...");
    const chunks = await page.evaluate(() => window.__poc.runChunkDump(15_000));

    console.log(`\n${chunks.length} chunks emitted:`);
    for (const c of chunks) {
      console.log(`  #${c.sequence}: ${c.byteLength} bytes, first16=${c.firstBytesHex}`);
    }

    const riffMagic = "52 49 46 46"; // "RIFF"
    const headered = chunks.filter((c) => c.firstBytesHex.startsWith(riffMagic));
    console.log(
      `\n${headered.length} of ${chunks.length} chunks start with RIFF. ` +
        (headered.length === 1 && headered[0]?.sequence === 0
          ? "Matches the upstream issue's claim: only chunk 0 is headered."
          : headered.length === chunks.length
            ? "Every chunk is independently headered (issue does not reproduce on this version)."
            : "Neither pattern cleanly — assembly.ts must handle per-chunk detection, not a blanket assumption."),
    );
  } finally {
    await browser.close();
    await vite.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
