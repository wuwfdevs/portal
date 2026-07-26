import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // ffmpeg-static ships a platform binary alongside its JS — Next's
  // dependency tracer only reliably includes that binary in the deployment
  // bundle (Vercel) when the package is marked external rather than bundled.
  // Used by lib/transcription/export.ts for clip WAV export.
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;
