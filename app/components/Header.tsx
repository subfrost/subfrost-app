 'use client';

 import Link from "next/link";
 import Image from "next/image";
 import { useEffect, useMemo, useRef, useState, useCallback, memo } from "react";
 import { usePathname } from "next/navigation";
 import { useWallet } from "@/context/WalletContext";
import { useTheme } from "@/context/ThemeContext";
 import { Menu, X } from "lucide-react";
 import AddressAvatar from "./AddressAvatar";

 const FallingSnowflakes = memo(function FallingSnowflakes({ white = false }: { white?: boolean }) {
   const snowflakes = useMemo(() => {
     const positions = [20, 40, 60, 80];
     const delays = [0, 1.5, 3, 4.5];
     const durations = [5.5, 6.5, 7, 6];
     const sizes = [12, 14, 11, 13];
     
     return Array.from({ length: 4 }, (_, i) => ({
       id: i,
       left: positions[i],
       delay: delays[i],
       duration: durations[i],
       size: sizes[i],
     }));
   }, []);

   return (
     <>
       <style dangerouslySetInnerHTML={{
         __html: `
           @keyframes snowfall {
             0% {
               transform: translateY(-30px) rotate(0deg);
               opacity: 0;
             }
             10% {
               opacity: 1;
             }
             90% {
               opacity: 1;
             }
             100% {
               transform: translateY(80px) rotate(360deg);
               opacity: 0;
             }
           }
         `
       }} />
       {snowflakes.map((flake) => (
         <Image
           key={flake.id}
           src="/brand/snowflake-mark.svg"
           alt=""
           width={flake.size}
           height={flake.size}
           className="pointer-events-none absolute"
           style={{
             left: `${flake.left}%`,
             top: '-10px',
             opacity: 0,
             animation: `snowfall ${flake.duration}s linear ${flake.delay}s infinite`,
             filter: white ? 'brightness(0) invert(1)' : 'drop-shadow(0 0 2px rgba(255,255,255,0.8)) brightness(1.5)',
           }}
         />
       ))}
     </>
   );
 });

 export default function Header() {
  const { connected, isConnected, address, onConnectModalOpenChange, disconnect } = useWallet() as any;
  const { theme } = useTheme();
   const pathname = usePathname();
   const [menuOpen, setMenuOpen] = useState(false);
   const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
   const menuRootRef = useRef<HTMLDivElement | null>(null);
   const mobileMenuRef = useRef<HTMLDivElement | null>(null);
   const truncate = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
  const walletConnected = typeof connected === 'boolean' ? connected : isConnected;

   const isActive = useCallback((path: string) => {
     if (path === '/') {
       return pathname === '/';
     }
     return pathname.startsWith(path);
   }, [pathname]);

   useEffect(() => {
     if (!menuOpen) return;
     const handleClickOutside = (e: MouseEvent | TouchEvent) => {
       if (!menuRootRef.current) return;
       if (!menuRootRef.current.contains(e.target as Node)) {
         setMenuOpen(false);
       }
     };
     const handleKey = (e: KeyboardEvent) => {
       if (e.key === 'Escape') setMenuOpen(false);
     };
     document.addEventListener('mousedown', handleClickOutside);
     document.addEventListener('touchstart', handleClickOutside, { passive: true } as any);
     document.addEventListener('keydown', handleKey);
     return () => {
       document.removeEventListener('mousedown', handleClickOutside);
       document.removeEventListener('touchstart', handleClickOutside as any);
       document.removeEventListener('keydown', handleKey);
     };
   }, [menuOpen]);

   useEffect(() => {
     if (!mobileMenuOpen) return;
     const handleClickOutside = (e: MouseEvent | TouchEvent) => {
       if (!mobileMenuRef.current) return;
       if (!mobileMenuRef.current.contains(e.target as Node)) {
         setMobileMenuOpen(false);
       }
     };
     const handleKey = (e: KeyboardEvent) => {
       if (e.key === 'Escape') setMobileMenuOpen(false);
     };
     document.addEventListener('mousedown', handleClickOutside);
     document.addEventListener('touchstart', handleClickOutside, { passive: true } as any);
     document.addEventListener('keydown', handleKey);
     return () => {
       document.removeEventListener('mousedown', handleClickOutside);
       document.removeEventListener('touchstart', handleClickOutside as any);
       document.removeEventListener('keydown', handleKey);
     };
   }, [mobileMenuOpen]);

   return (
    <header className="relative z-50 w-full bg-[color:var(--sf-glass-bg)] backdrop-blur-md shadow-[0_1px_0_rgba(0,0,0,0.05)] border-b border-[color:var(--sf-glass-border)]">
      <div className="relative flex h-[58px] w-full items-center px-6 sm:px-10">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 select-none" aria-label="Subfrost Home">
          <Image
            src="/brand/snowflake_2025.svg"
            alt="Subfrost snowflake logo"
            width={24}
            height={24}
            priority
            className="w-6 h-6"
          />
          <Image
            src="/brand/subfrost-wordmark.svg"
            alt="SUBFROST wordmark"
            width={180}
            height={24}
            priority
            className="transition-opacity hover:opacity-80 h-6 w-auto sf-wordmark"
          />
        </Link>

        {/* Desktop Nav (centered to viewport) */}
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-4 md:flex lg:gap-8 xl:gap-12">
          <Link href="/" className={`text-sm font-bold tracking-[0.08em] uppercase hover:opacity-80 outline-none focus:outline-none transition-all whitespace-nowrap ${isActive('/') ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)] pb-1' : 'text-[color:var(--sf-text)]'}`}>
            HOME
          </Link>
          <Link href="/swap" className={`text-sm font-bold tracking-[0.08em] uppercase hover:opacity-80 outline-none focus:outline-none transition-all whitespace-nowrap ${isActive('/swap') ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)] pb-1' : 'text-[color:var(--sf-text)]'}`}>
            SWAP
          </Link>
          <Link href="/vaults" className={`text-sm font-bold tracking-[0.08em] uppercase hover:opacity-80 outline-none focus:outline-none transition-all whitespace-nowrap ${isActive('/vaults') ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)] pb-1' : 'text-[color:var(--sf-text)]'}`}>
            VAULTS
          </Link>
          <Link href="/futures" className={`text-sm font-bold tracking-[0.08em] uppercase hover:opacity-80 outline-none focus:outline-none transition-all whitespace-nowrap ${isActive('/futures') ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)] pb-1' : 'text-[color:var(--sf-text)]'}`}>
            FUTURES
          </Link>
        </nav>

        {/* Desktop CTA */}
         <div className="ml-auto relative hidden md:block" ref={menuRootRef}>
          {walletConnected ? (
             <>
               <button
                 type="button"
                 onClick={() => setMenuOpen((v) => !v)}
                 className={`flex items-center gap-2 rounded-full bg-[color:var(--sf-surface)] px-4 py-2 text-sm font-bold tracking-[0.08em] text-[color:var(--sf-text)] transition-colors hover:bg-[color:var(--sf-surface)]/95 border border-[color:var(--sf-outline)] focus:outline-none ${theme === 'dark' ? 'shadow-[0_2px_0_rgba(0,0,0,0.2),0_6px_14px_rgba(0,0,0,0.12)]' : ''}`}
               >
                 <AddressAvatar address={address} size={24} />
                 <span className="hidden sm:inline">{truncate(address)}</span>
               </button>
               {menuOpen ? (
                 <div className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
                  <Link
                    href="/wallet"
                    onClick={() => setMenuOpen(false)}
                    className="w-full px-4 py-3 text-left text-sm font-medium text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/10 block"
                  >
                    Wallet Dashboard
                  </Link>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await disconnect();
                      } catch (e) {
                        // noop
                      } finally {
                        setMenuOpen(false);
                      }
                    }}
                     className="w-full px-4 py-3 text-left text-sm font-medium text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/10"
                   >
                     Disconnect wallet
                   </button>
                 </div>
               ) : null}
             </>
           ) : (
             <div className="relative">
               <button
                 type="button"
                 onClick={() => onConnectModalOpenChange(true)}
                 className="relative rounded-lg bg-[color:var(--sf-surface)] px-6 py-2 text-sm font-bold tracking-[0.08em] text-[color:var(--sf-text)] transition-colors hover:bg-[color:var(--sf-surface)]/95 border border-[color:var(--sf-outline)] focus:outline-none overflow-hidden"
               >
                 <span className="relative z-10">CONNECT WALLET</span>
                 {theme === 'light' && (
                   <div className="absolute inset-0 pointer-events-none">
                     <FallingSnowflakes />
                   </div>
                 )}
               </button>
             </div>
           )}
         </div>

        {/* Mobile Hamburger Menu */}
         <div className="ml-auto md:hidden" ref={mobileMenuRef}>
           <button
             type="button"
             onClick={() => setMobileMenuOpen((v) => !v)}
             className="flex items-center justify-center w-10 h-10 rounded-lg text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/10 focus:outline-none"
             aria-label="Toggle mobile menu"
           >
             {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
           </button>

           {mobileMenuOpen && (
             <div className="fixed left-0 right-0 top-[58px] mx-4 overflow-hidden rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)] shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
               <nav className="flex flex-col">
                 <Link
                   href="/"
                   onClick={() => setMobileMenuOpen(false)}
                   className={`px-6 py-4 text-sm font-bold tracking-[0.08em] uppercase hover:bg-[color:var(--sf-primary)]/10 border-b border-[color:var(--sf-glass-border)] outline-none focus:outline-none transition-all ${isActive('/') ? 'text-[color:var(--sf-primary)] bg-[color:var(--sf-primary)]/10 border-l-4 border-l-[color:var(--sf-primary)]' : 'text-[color:var(--sf-text)]'}`}
                 >
                   HOME
                 </Link>
                 <Link
                   href="/swap"
                   onClick={() => setMobileMenuOpen(false)}
                   className={`px-6 py-4 text-sm font-bold tracking-[0.08em] uppercase hover:bg-[color:var(--sf-primary)]/10 border-b border-[color:var(--sf-glass-border)] outline-none focus:outline-none transition-all ${isActive('/swap') ? 'text-[color:var(--sf-primary)] bg-[color:var(--sf-primary)]/10 border-l-4 border-l-[color:var(--sf-primary)]' : 'text-[color:var(--sf-text)]'}`}
                 >
                   SWAP
                 </Link>
                 <Link
                   href="/vaults"
                   onClick={() => setMobileMenuOpen(false)}
                   className={`px-6 py-4 text-sm font-bold tracking-[0.08em] uppercase hover:bg-[color:var(--sf-primary)]/10 border-b border-[color:var(--sf-glass-border)] outline-none focus:outline-none transition-all ${isActive('/vaults') ? 'text-[color:var(--sf-primary)] bg-[color:var(--sf-primary)]/10 border-l-4 border-l-[color:var(--sf-primary)]' : 'text-[color:var(--sf-text)]'}`}
                 >
                   VAULTS
                 </Link>
                 <Link
                   href="/futures"
                   onClick={() => setMobileMenuOpen(false)}
                   className={`px-6 py-4 text-sm font-bold tracking-[0.08em] uppercase hover:bg-[color:var(--sf-primary)]/10 border-b border-[color:var(--sf-glass-border)] outline-none focus:outline-none transition-all ${isActive('/futures') ? 'text-[color:var(--sf-primary)] bg-[color:var(--sf-primary)]/10 border-l-4 border-l-[color:var(--sf-primary)]' : 'text-[color:var(--sf-text)]'}`}
                 >
                   FUTURES
                 </Link>
                 
                 {walletConnected ? (
                   <div className="px-6 py-4">
                     <div className="mb-2 text-xs text-[color:var(--sf-text)]/70">Connected</div>
                     <div className="mb-3 flex items-center gap-2">
                       <AddressAvatar address={address} size={24} />
                       <span className="text-sm font-semibold text-[color:var(--sf-text)]">{truncate(address)}</span>
                     </div>
                     <Link
                       href="/wallet"
                       onClick={() => setMobileMenuOpen(false)}
                       className="w-full mb-2 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 block text-center"
                     >
                       WALLET DASHBOARD
                     </Link>
                     <button
                       type="button"
                       onClick={async () => {
                         try {
                           await disconnect();
                         } catch (e) {
                           // noop
                         } finally {
                           setMobileMenuOpen(false);
                         }
                       }}
                       className="w-full rounded-lg bg-[color:var(--sf-surface)] px-4 py-2 text-sm font-semibold text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]/90"
                     >
                       DISCONNECT WALLET
                     </button>
                   </div>
                 ) : (
                   <div className="px-6 py-4">
                     <button
                       type="button"
                       onClick={() => {
                         onConnectModalOpenChange(true);
                         setMobileMenuOpen(false);
                       }}
                       className="relative w-full rounded-lg bg-[color:var(--sf-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[color:var(--sf-primary-pressed)] overflow-hidden"
                     >
                       <span className="relative z-10">CONNECT WALLET</span>
                       {theme === 'light' && (
                         <div className="absolute inset-0 pointer-events-none">
                           <FallingSnowflakes white />
                         </div>
                       )}
                     </button>
                   </div>
                 )}
               </nav>
             </div>
           )}
         </div>
      </div>
    </header>
  );
}


