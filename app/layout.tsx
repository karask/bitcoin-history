import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { sitePath } from "@/lib/site-path";
import { publicBase, shareMetadata } from "@/lib/share-meta";

const sans = Geist({ variable: "--sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--mono", subsets: ["latin"] });

const title = "Bitcoin Timechain";
const description = "A source-led journey through the protocol, culture, crises, and adoption that shaped Bitcoin.";

export const metadata: Metadata = {
  metadataBase: new URL(publicBase),
  title,
  description,
  // Root-relative with the base path: a bare "favicon.png" resolved under /events/ on
  // event pages, which then had no icon.
  icons: { icon: sitePath("/favicon.png"), shortcut: sitePath("/favicon.png") },
  ...shareMetadata({ title, description, path: "/" }),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${sans.variable} ${mono.variable}`}>{children}</body></html>;
}
