import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import Providers from "@/app/providers";
import AppShell from "@/app/components/AppShell";
import { SnowflakeWatermark } from "@/app/components/SnowflakeWatermark";

const satoshi = localFont({
  src: [
    { path: "./fonts/Satoshi-Light.woff2", weight: "300", style: "normal" },
    { path: "./fonts/Satoshi-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Satoshi-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-satoshi",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SUBFROST — Stake BTC",
  description: "Stake BTC and earn yield in BTC with Subfrost.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${satoshi.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          <SnowflakeWatermark />
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
