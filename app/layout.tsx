import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Navbar } from "./components/Navbar";
import { SnowflakeBackground } from "./components/SnowflakeBackground";
import { SnowflakeWatermark } from "./components/SnowflakeWatermark";
import { Footer } from "./components/Footer";
import { SocialIcons } from "./components/SocialIcons";
import { MobileWalletButton } from "./components/MobileWalletButton";
import { Toaster } from "@/components/ui/toaster";
import { SubfrostP2PProvider } from "./contexts/SubfrostP2PContext";
import { BalancesProvider } from "./contexts/BalancesContext";
import { BalancesVisibilityProvider } from "./contexts/BalancesVisibilityContext";
// import * as regtest from "./lib/rtest";
import { LaserEyesProvider } from "@omnisat/lasereyes";
import { RegtestProvider } from "./contexts/RegtestContext";

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
          </LaserEyesProvider>
        </RegtestProvider>
      </body>
    </html>
  );
}
