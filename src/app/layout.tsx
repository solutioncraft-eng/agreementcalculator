import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { PRODUCT_NAME, siteUrl } from "@/lib/seo";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-archivo",
});

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  // Absolute base for canonicals, Open Graph URLs and the generated preview
  // image; without it Next resolves them against localhost.
  metadataBase: new URL(siteUrl()),
  title: {
    default: PRODUCT_NAME,
    template: `%s · ${PRODUCT_NAME}`,
  },
  description: "Managed services agreement pricing, review and approval",
  applicationName: PRODUCT_NAME,
  // The application is private by default; the marketing pages opt back in.
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: PRODUCT_NAME,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${archivo.variable} ${plex.variable} ${plexMono.variable}`}>{children}</body>
    </html>
  );
}
