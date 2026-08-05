import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // ffmpeg-static ships a platform binary alongside its JS — Next's
  // dependency tracer only reliably includes that binary in the deployment
  // bundle (Vercel) when the package is marked external rather than bundled.
  // Used by lib/transcription/export.ts for clip WAV export.
  serverExternalPackages: ["ffmpeg-static"],
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
    ];
  },
};

export default nextConfig;
