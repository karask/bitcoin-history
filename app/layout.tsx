import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ variable: "--sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--mono", subsets: ["latin"] });

const title = "Bitcoin Timechain";
const description = "A source-led journey through the protocol, culture, crises, and adoption that shaped Bitcoin.";
const publicBase = "https://kkarasavvas.com/bitcoin-history/";

export const metadata: Metadata = {
  metadataBase: new URL(publicBase),
  title,
  description,
  icons: { icon: "favicon.png", shortcut: "favicon.png" },
  openGraph: { title, description, type: "website", url: publicBase, images: [{ url: "og.png", width: 1731, height: 909, alt: "Bitcoin Timechain — History doesn’t move in a straight line." }] },
  twitter: { card: "summary_large_image", title, description, images: ["og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${sans.variable} ${mono.variable}`}>{children}</body></html>;
}
