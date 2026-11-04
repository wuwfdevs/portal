import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { StationProvider } from "@/components/station-provider";
import { getStationProfile } from "@/lib/station";
import { toolsTitle } from "@/lib/station-brand";

// Self-hosted rather than next/font/google: Turbopack's Google Fonts fetch
// has repeatedly failed production builds (a live dependency on Google's
// font CDN at build time). These are the same three families/weights,
// downloaded once — see CLAUDE.md.
const sourceSans = localFont({
  src: [
    { path: "./fonts/source-sans-3-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/source-sans-3-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/source-sans-3-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-source-sans",
  display: "swap",
});

const sourceSerif = localFont({
  src: [
    { path: "./fonts/source-serif-4-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/source-serif-4-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/source-serif-4-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-source-serif",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: [
    { path: "./fonts/jetbrains-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/jetbrains-mono-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// The station's own name, from its settings (shared with the layout below through a per-request cache).
export async function generateMetadata(): Promise<Metadata> {
  const station = await getStationProfile();
  return {
    title: toolsTitle(station),
    description: `Internal tools portal for ${station.name} staff, students, and partners.`,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const station = await getStationProfile();
  return (
    <html
      lang="en"
      className={`${sourceSans.variable} ${sourceSerif.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-sans antialiased">
        <StationProvider profile={station}>{children}</StationProvider>
      </body>
    </html>
  );
}
