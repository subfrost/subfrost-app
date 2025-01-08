import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Navbar } from './components/Navbar'
import { MobileNavigation } from './components/MobileNavigation'
import { UserBalances } from './components/UserBalances'
import { SnowflakeBackground } from './components/SnowflakeBackground'
import { SnowflakeWatermark } from './components/SnowflakeWatermark'
import { Footer } from './components/Footer'
import { Toaster } from "@/components/ui/toaster"
import { SubfrostP2PProvider } from './contexts/SubfrostP2PContext'
import { LaserEyesProvider } from '@omnisat/lasereyes'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'SUBFROST',
  description: 'Wrap, Stake, and Govern your BTC',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gradient-to-b from-blue-100 to-blue-200 min-h-screen flex flex-col`}>
        <LaserEyesProvider>
          <SubfrostP2PProvider>
            <SnowflakeBackground />
            <SnowflakeWatermark />
            <div className="flex flex-col min-h-screen">
              <Navbar />
              <UserBalances />
              <main className="flex-grow container mx-auto p-4 mobile-bottom-padding">
                {children}
              </main>
              <MobileNavigation />
              <Footer />
              <Toaster />
            </div>
          </SubfrostP2PProvider>
        </LaserEyesProvider>
      </body>
    </html>
  )
}

