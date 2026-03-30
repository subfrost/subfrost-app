import type { Metadata } from "next";
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

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "SUBFROST | Layer-0 App on Bitcoin",
  description: "The Bitcoin-native Layer 0 for seamless DeFi. Swap BTC, ETH, ZEC & stablecoins on L1. Earn real BTC yield with dxBTC tokenized staking. No lock-ups, no wrapped tokens - pure Bitcoin DeFi.",
  keywords: ["Bitcoin DeFi", "dxBTC", "frBTC", "cross-chain swaps", "BTC yield", "Bitcoin Layer 0", "native asset swaps", "Bitcoin AMM", "BTC staking", "Subfrost"],
  icons: {
    icon: "/brand/Logo.png",
    apple: "/brand/Logo.png",
  },
  openGraph: {
    title: "SUBFROST | Layer-0 App on Bitcoin",
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
    title: "SUBFROST | Layer-0 App on Bitcoin",
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
        {/* Console filter — inlined to guarantee execution before any module loads */}
        <script dangerouslySetInnerHTML={{__html: `(function(){if(typeof window==='undefined')return;if(new URLSearchParams(window.location.search).has('verbose'))return;var A=['[devnet-boot]','[devnet]','[DevnetContext]','[LimitOrder]','Error','error','FATAL','FAILED','deployed','Phase '];function ok(a){for(var i=0;i<a.length;i++){var v=a[i];if(v instanceof Error)return true;if(typeof v==='string')for(var j=0;j<A.length;j++)if(v.indexOf(A[j])!==-1)return true;}return false;}var L=console.log.bind(console),W=console.warn.bind(console),E=console.error.bind(console);Object.defineProperty(console,'log',{value:function(){if(ok(arguments))L.apply(null,arguments);},writable:true,configurable:true});Object.defineProperty(console,'warn',{value:function(){if(ok(arguments))W.apply(null,arguments);},writable:true,configurable:true});Object.defineProperty(console,'error',{value:function(){if(arguments.length>0&&(arguments[0] instanceof Error||ok(arguments)))E.apply(null,arguments);},writable:true,configurable:true});Object.defineProperty(console,'debug',{value:function(){},writable:true,configurable:true});})();`}} />
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
