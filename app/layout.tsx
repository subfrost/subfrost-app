import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import Script from "next/script";
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
        {/* Prevent zoom on mobile input focus */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        {/* Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-E19YHZ6JRK"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-E19YHZ6JRK');
          `}
        </Script>
        {/* Google Drive API for client-side OAuth */}
        <script src="https://apis.google.com/js/api.js" async defer></script>
        <script src="https://accounts.google.com/gsi/client" async defer></script>
        {/* Splash screen animation — defer so it runs after DOM is parsed */}
        <script src="/splash.js" defer></script>
      </head>
      <body className={`${satoshi.variable} ${geistMono.variable} antialiased`}>
        {/* Splash screen — shows while JS/WASM loads. Canvas snowflake + progress bar. */}
        <div
          id="sf-splash"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: '#0a1628',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <canvas
            id="sf-splash-canvas"
            width={160}
            height={160}
            style={{ width: 160, height: 160 }}
          />
          <div
            style={{
              marginTop: 20,
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: 8,
              color: '#5b9cff',
              textShadow: '0 0 20px rgba(91,156,255,0.4)',
              fontFamily: 'monospace',
            }}
          >
            SUBFROST
          </div>
          <div
            style={{
              marginTop: 28,
              width: 200,
              height: 2,
              background: 'rgba(91,156,255,0.12)',
              borderRadius: 1,
              overflow: 'hidden',
            }}
          >
            <div
              id="sf-splash-bar"
              style={{
                height: '100%',
                width: '0%',
                background: 'linear-gradient(90deg, #3a6fd8, #5b9cff, #c7e0fe)',
                borderRadius: 1,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <div
            id="sf-splash-pct"
            style={{
              marginTop: 10,
              fontSize: 10,
              fontFamily: 'monospace',
              color: 'rgba(91,156,255,0.4)',
              letterSpacing: 3,
            }}
          />
        </div>
        <AlkanesWasmInitializer />
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
