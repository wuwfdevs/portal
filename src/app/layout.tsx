import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "WUWF Tools",
  description: "Internal tools portal for WUWF Public Media staff, students, and partners.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sourceSans.variable} ${sourceSerif.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
