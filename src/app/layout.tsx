import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Navbar } from "@/app/components/Navbar";
import { SnowflakeBackground } from "@/app/components/SnowflakeBackground";
import { SnowflakeWatermark } from "@/app/components/SnowflakeWatermark";
import { Footer } from "@/app/components/Footer";
import { SocialIcons } from "@/app/components/SocialIcons";
import { MobileWalletButton } from "@/app/components/MobileWalletButton";
import { Toaster } from "@/components/ui/toaster";
import { SubfrostP2PProvider } from "@/context/SubfrostP2PContext";
import { BalancesProvider } from "@/context/BalancesContext";
import { BalancesVisibilityProvider } from "@/context/BalancesVisibilityContext";
// import * as regtest from "./lib/rtest";
import { LaserEyesProvider } from "@omnisat/lasereyes";
import { RegtestProvider } from "@/context/RegtestContext";
import { WalletProvider } from "@/context/WalletContext";

const satoshi = localFont({
  src: [
    {
      path: './fonts/Satoshi-Light.woff2',
      weight: '300',
      style: 'normal',
    },
    {
      path: './fonts/Satoshi-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/Satoshi-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-satoshi',
});

export const metadata: Metadata = {
  title: "SUBFROST",
  description: "Wrap, Stake, and Govern your BTC",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${satoshi.className} bg-gradient-to-b from-blue-200 to-blue-50 min-h-screen h-screen flex flex-col m-0 p-0 overflow-x-hidden`}
      >
        <RegtestProvider>
          <LaserEyesProvider>
            <WalletProvider>
              <BalancesProvider>
              <BalancesVisibilityProvider>
                <SubfrostP2PProvider>
                  <SnowflakeBackground />
                  <SnowflakeWatermark />
                  <div className="flex flex-col min-h-screen h-screen w-full">
                    <Navbar />
                    <main className="flex-grow container mx-auto p-4 mobile-bottom-padding">
                      {children}
                    </main>
                    <Footer />
                    <SocialIcons />
                    <MobileWalletButton />
                    <Toaster />
                  </div>
                </SubfrostP2PProvider>
              </BalancesVisibilityProvider>
            </BalancesProvider>
            </WalletProvider>
          </LaserEyesProvider>
        </RegtestProvider>
      </body>
    </html>
  );
}
