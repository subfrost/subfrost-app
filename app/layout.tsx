import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { Navbar } from "./components/Navbar";
import { MobileNavigation } from "./components/MobileNavigation";
import { SnowflakeBackground } from "./components/SnowflakeBackground";
import { SnowflakeWatermark } from "./components/SnowflakeWatermark";
import { Footer } from "./components/Footer";
import { SocialIcons } from "./components/SocialIcons";
import { Toaster } from "@/components/ui/toaster";
import { SubfrostP2PProvider } from "./contexts/SubfrostP2PContext";
import { BalancesProvider } from "./contexts/BalancesContext";
// import * as regtest from "./lib/rtest";
import { LaserEyesProvider } from "@omnisat/lasereyes";
import { RegtestProvider } from "./contexts/RegtestContext";

const nunito = Nunito({ weight: ["300", "400", "700"], subsets: ["latin"] });

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
        className={`${nunito.className} bg-gradient-to-b from-blue-100 to-blue-200 min-h-screen h-screen flex flex-col m-0 p-0 overflow-x-hidden`}
      >
        <RegtestProvider>
          <LaserEyesProvider>
            {" "}
            <BalancesProvider>
              <SubfrostP2PProvider>
                <SnowflakeBackground />
                <SnowflakeWatermark />
                <div className="flex flex-col min-h-screen h-screen w-full">
                  <Navbar />
                  <main className="flex-grow container mx-auto p-4 mobile-bottom-padding">
                    {children}
                  </main>
                  <MobileNavigation />
                  <Footer />
                  <SocialIcons />
                  <Toaster />
                </div>
              </SubfrostP2PProvider>
            </BalancesProvider>
          </LaserEyesProvider>
        </RegtestProvider>
      </body>
    </html>
  );
}
