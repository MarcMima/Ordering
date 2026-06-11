import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

/* MIMA brand fonts: Alverata (headings) + Degular (UI) — see globals.css @font-face TODO for licensed files. */

export const metadata: Metadata = {
  title: "MIMA Kitchen",
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
    <html lang="en">
      <body className="font-sans antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
