// Log's offline copy of the live rundown screen — docs/log-design.md §6,
// "Host live-view resilience." Registered by the rundown screen itself
// (src/app/(portal)/log/broadcast-sync.tsx), production builds only.
//
// It does exactly two things and leaves every other request alone:
//
// 1. Rundown pages (/log/rundowns/<id>) are network-first: a successful
//    load is kept, and only when the network fails outright is the kept
//    copy served instead — so reloading during an outage shows the rundown
//    (as of when it was kept; the screen says so) rather than the browser's
//    "no internet" page. The page asks for a fresh copy to be kept as it
//    re-renders during a shift ("cache-page" below).
// 2. Next's hashed build assets (/_next/static/…) that a rundown page loads
//    are kept too, since the kept page can't run without them. They are
//    immutable by name, so a kept copy is always correct.
//
// Server Actions (POST), RSC refreshes, and every other page are never
// touched: offline, the queued aired/missed/move actions live in IndexedDB,
// not here.

const CACHE = "log-offline-v1";
const RUNDOWN_PAGE = /^\/log\/rundowns\/[^/]+\/?$/;
/** Build assets kept at most; oldest dropped first (the cache grows across deploys). */
const MAX_ASSETS = 400;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("log-offline-") && name !== CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

function pageKey(url) {
  const parsed = new URL(url);
  return parsed.origin + parsed.pathname.replace(/\/$/, "");
}

async function keepPage(url, response) {
  const cache = await caches.open(CACHE);
  if (response.ok && !response.redirected && response.type === "basic") {
    await cache.put(pageKey(url), response);
  } else if (
    response.redirected ||
    response.type === "opaqueredirect" ||
    response.status === 401 ||
    response.status === 403
  ) {
    // Signed out (redirected to /login) or no longer allowed: drop the copy.
    await cache.delete(pageKey(url));
  }
}

async function pruneAssets(cache) {
  const keys = await cache.keys();
  const assets = keys.filter((request) =>
    new URL(request.url).pathname.startsWith("/_next/static/"),
  );
  const excess = assets.length - MAX_ASSETS;
  for (let i = 0; i < excess; i++) await cache.delete(assets[i]);
}

async function rundownPage(request) {
  try {
    const response = await fetch(request);
    await keepPage(request.url, response.clone()).catch(() => undefined);
    return response;
  } catch (error) {
    // ignoreVary: Next's responses vary on RSC request headers a plain
    // navigation doesn't send either way.
    const cached = await caches.match(pageKey(request.url), { ignoreVary: true });
    if (cached) return cached;
    throw error;
  }
}

async function buildAsset(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  if (response.ok) {
    // Only what a rundown page loads — this worker isn't a cache for the
    // whole portal.
    const client = event.clientId ? await self.clients.get(event.clientId) : null;
    if (client && RUNDOWN_PAGE.test(new URL(client.url).pathname)) {
      await cache.put(event.request, response.clone());
      await pruneAssets(cache);
    }
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && RUNDOWN_PAGE.test(url.pathname)) {
    event.respondWith(rundownPage(request));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(buildAsset(event));
  }
});

// The open rundown screen asks for a fresh copy as it re-renders, so an
// offline reload late in a shift doesn't show the page as it was at the
// start of it.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "cache-page" || typeof data.url !== "string") return;
  const url = new URL(data.url, self.location.origin);
  if (url.origin !== self.location.origin || !RUNDOWN_PAGE.test(url.pathname)) return;
  event.waitUntil(
    fetch(url.href, { credentials: "same-origin" })
      .then((response) => keepPage(url.href, response))
      .catch(() => undefined),
  );
});
