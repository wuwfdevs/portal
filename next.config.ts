import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // ffmpeg-static ships a platform binary alongside its JS — Next's
  // dependency tracer only reliably includes that binary in the deployment
  // bundle (Vercel) when the package is marked external rather than bundled.
  // Used by lib/transcription/export.ts for clip WAV export.
  // @react-pdf/renderer (affidavit PDFs) is loaded as plain Node modules
  // too: its layout engine loads a WebAssembly build and fonts at runtime,
  // which is how it's run and tested outside Next.
  serverExternalPackages: ["ffmpeg-static", "@react-pdf/renderer"],
  // The affidavit PDF (lib/underwriting/affidavit-pdf.tsx) reads the logo
  // from public/ with fs at render time; public/ isn't in a serverless
  // function's bundle unless traced in. The PDF falls back to a text
  // letterhead if it's missing.
  outputFileTracingIncludes: {
    "/api/underwriting/affidavits/*": ["./public/wuwf-logo.png"],
    "/underwriting/affidavits/*": ["./public/wuwf-logo.png"],
  },
  experimental: {
    serverActions: {
      // Two Server Actions take a document as their form's payload — the
      // program-log import (log/import-actions.ts) and creating a contract
      // from its agreement (underwriting/agreement-import-actions.ts) — and
      // both cap the upload at 10 MB. Next's default cap for an action's
      // body is 1 MB, which a scanned agreement packet (1.15 MB, the first
      // real one tried) exceeded outright: "Body exceeded 1 MB limit", a
      // 413 surfaced to the user as an opaque Server Components error.
      bodySizeLimit: "12mb",
    },
  },
  async headers() {
    return [
      {
        // Audience Listening's public participation route is meant to be framed
        // cross-origin, inside a Grove Responsive Embed. Next sets no
        // X-Frame-Options by default, so these routes are already framable —
        // saying so explicitly states the intent and keeps a future global CSP
        // from silently breaking every embed already published in a story.
        //
        // Microphone access inside the frame is delegated by the *parent* page's
        // allow="microphone" attribute (see lib/audience-listening/embed.ts);
        // nothing set here can grant it, and nothing here should restrict it.
        source: "/listen/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
      {
        // Academic Partnerships' public inquiry form, meant to be framed
        // cross-origin the same way — see the /listen rule above for why this
        // has to be explicit.
        source: "/partner/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
      {
        // Bookings' public request form, framed the same way (docs/bookings-design.md §6.3).
        source: "/book/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
};

export default nextConfig;
