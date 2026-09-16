import type { Metadata, Viewport } from "next";
import { Newsreader, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

/* Mima brand fonts: Alverata (headings) + Degular (UI). Until the licensed files are in
   public/fonts/, Newsreader and Hanken Grotesk stand in (same sizes/leading/tracking). */
const newsreader = Newsreader({ subsets: ["latin"], weight: ["500"], style: ["normal"], variable: "--font-newsreader", display: "swap" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--font-hanken", display: "swap" });

export const metadata: Metadata = {
  title: "Mima Kitchen",
  description: "Kitchen operations platform for stocktaking, prep lists, and ordering",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${newsreader.variable} ${hanken.variable}`}>
      <body className="font-sans antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
