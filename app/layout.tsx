import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import Providers from "@/app/providers";
import AppShell from "@/app/components/AppShell";
import { AlkanesWasmInitializer } from "@/app/components/AlkanesWasmInitializer";

const satoshi = localFont({
  src: [
    { path: "./fonts/Satoshi-Light.woff2", weight: "300", style: "normal" },
    { path: "./fonts/Satoshi-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Satoshi-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-satoshi",
});

const geistMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SUBFROST | Cross-Chain DeFi on Bitcoin - dxBTC Yield & Native Asset Swaps",
  description: "The Bitcoin-native Layer 0 for seamless DeFi. Swap BTC, ETH, ZEC & stablecoins on L1. Earn real BTC yield with dxBTC tokenized staking. No lock-ups, no wrapped tokens - pure Bitcoin DeFi.",
  keywords: ["Bitcoin DeFi", "dxBTC", "frBTC", "cross-chain swaps", "BTC yield", "Bitcoin Layer 0", "native asset swaps", "Bitcoin AMM", "BTC staking", "Subfrost"],
  icons: {
    icon: "/brand/Logo.png",
    apple: "/brand/Logo.png",
  },
  openGraph: {
    title: "SUBFROST | Cross-Chain DeFi on Bitcoin - dxBTC Yield & Native Asset Swaps",
    description: "The Bitcoin-native Layer 0 for seamless DeFi. Swap BTC, ETH, ZEC & stablecoins directly on L1. Earn real BTC yield with dxBTC - no lock-ups, no wrapped tokens.",
    images: [
      {
        url: "/brand/Logo.png",
        width: 1200,
        height: 1200,
        alt: "Subfrost - Bitcoin-Native DeFi Platform",
      },
    ],
    siteName: "Subfrost",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SUBFROST | Cross-Chain DeFi on Bitcoin - dxBTC Yield & Native Asset Swaps",
    description: "The Bitcoin-native Layer 0 for seamless DeFi. Swap BTC, ETH, ZEC & stablecoins on L1. Earn real BTC yield with dxBTC - no lock-ups.",
    images: ["/brand/Logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        {/* Google Drive API for client-side OAuth */}
        <script src="https://apis.google.com/js/api.js" async defer></script>
        <script src="https://accounts.google.com/gsi/client" async defer></script>
      </head>
      <body className={`${satoshi.variable} ${geistMono.variable} antialiased`}>
        <AlkanesWasmInitializer />
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
