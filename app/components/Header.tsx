 'use client';

 import Link from "next/link";
 import Image from "next/image";
 import { useEffect, useRef, useState } from "react";
 import { useWallet } from "@/context/WalletContext";
 import { Menu, X } from "lucide-react";

 export default function Header() {
  const { connected, isConnected, address, onConnectModalOpenChange, disconnect } = useWallet() as any;
   const [menuOpen, setMenuOpen] = useState(false);
   const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
   const menuRootRef = useRef<HTMLDivElement | null>(null);
   const mobileMenuRef = useRef<HTMLDivElement | null>(null);
   const truncate = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
  const walletConnected = typeof connected === 'boolean' ? connected : isConnected;

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
    <header className="relative z-50 w-full bg-[color:var(--sf-glass-bg)] backdrop-blur-md shadow-[0_1px_0_rgba(40,67,114,0.05)] border-b border-[color:var(--sf-glass-border)]">
      <div className="relative flex h-16 w-full items-center px-6 sm:h-20 sm:px-10">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 select-none" aria-label="Subfrost Home">
          <Image
            src="/brand/snowflake_2025.svg"
            alt="Subfrost snowflake logo"
            width={24}
            height={24}
            priority
          />
          <Image
            src="/brand/subfrost-wordmark.svg"
            alt="SUBFROST wordmark"
            width={180}
            height={24}
            priority
          />
        </Link>

        {/* Desktop Nav (centered to viewport) */}
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-12 md:flex">
          <Link href="/earn" className="text-sm font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)] hover:opacity-80 sf-focus-ring">
            EARN
          </Link>
          <Link href="/swap" className="text-sm font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)] hover:opacity-80 sf-focus-ring">
            SWAP
          </Link>
          <Link href="/vaults" className="text-sm font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)] hover:opacity-80 sf-focus-ring">
            VAULTS
          </Link>
          <Link href="/futures" className="text-sm font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)] hover:opacity-80 sf-focus-ring">
            FUTURES
          </Link>
          <Link href="#" className="text-sm font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)] hover:opacity-80 sf-focus-ring">
            GOVERNANCE
          </Link>
        </nav>

        {/* Desktop CTA */}
         <div className="ml-auto relative hidden md:block" ref={menuRootRef}>
          {walletConnected ? (
             <>
               <button
                 type="button"
                 onClick={() => setMenuOpen((v) => !v)}
                 className="rounded-full bg-white px-6 py-2 text-sm font-bold tracking-[0.08em] text-[color:var(--sf-text)] shadow-[0_2px_0_rgba(40,67,114,0.2),0_6px_14px_rgba(40,67,114,0.12)] transition-colors hover:bg-white/95 border border-[color:var(--sf-outline)] sf-focus-ring"
               >
                 {truncate(address)}
               </button>
               {menuOpen ? (
                 <div className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
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
                     className="w-full px-4 py-3 text-left text-sm font-medium text-[color:var(--sf-text)] hover:bg-white/10"
                   >
                     Disconnect wallet
                   </button>
                 </div>
               ) : null}
             </>
           ) : (
             <button
               type="button"
               onClick={() => onConnectModalOpenChange(true)}
               className="rounded-full bg-white px-6 py-2 text-sm font-bold tracking-[0.08em] text-[color:var(--sf-text)] shadow-[0_2px_0_rgba(40,67,114,0.2),0_6px_14px_rgba(40,67,114,0.12)] transition-colors hover:bg-white/95 border border-[color:var(--sf-outline)] sf-focus-ring"
             >
               CONNECT WALLET
             </button>
           )}
         </div>

        {/* Mobile Hamburger Menu */}
         <div className="ml-auto md:hidden" ref={mobileMenuRef}>
           <button
             type="button"
             onClick={() => setMobileMenuOpen((v) => !v)}
             className="flex items-center justify-center w-10 h-10 rounded-lg text-[color:var(--sf-text)] hover:bg-white/10 sf-focus-ring"
             aria-label="Toggle mobile menu"
           >
             {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
           </button>

           {mobileMenuOpen && (
             <div className="fixed left-0 right-0 top-16 mx-4 overflow-hidden rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
               <nav className="flex flex-col">
                 <Link
                   href="/earn"
                   onClick={() => setMobileMenuOpen(false)}
                   className="px-6 py-4 text-sm font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)] hover:bg-white/10 border-b border-[color:var(--sf-glass-border)]"
                 >
                   EARN
                 </Link>
                 <Link
                   href="/swap"
                   onClick={() => setMobileMenuOpen(false)}
                   className="px-6 py-4 text-sm font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)] hover:bg-white/10 border-b border-[color:var(--sf-glass-border)]"
                 >
                   SWAP
                 </Link>
                 <Link
                   href="/vaults"
                   onClick={() => setMobileMenuOpen(false)}
                   className="px-6 py-4 text-sm font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)] hover:bg-white/10 border-b border-[color:var(--sf-glass-border)]"
                 >
                   VAULTS
                 </Link>
                 <Link
                   href="/futures"
                   onClick={() => setMobileMenuOpen(false)}
                   className="px-6 py-4 text-sm font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)] hover:bg-white/10 border-b border-[color:var(--sf-glass-border)]"
                 >
                   FUTURES
                 </Link>
                 <Link
                   href="#"
                   onClick={() => setMobileMenuOpen(false)}
                   className="px-6 py-4 text-sm font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)] hover:bg-white/10 border-b border-[color:var(--sf-glass-border)]"
                 >
                   GOVERNANCE
                 </Link>
                 
                 {walletConnected ? (
                   <div className="px-6 py-4">
                     <div className="mb-2 text-xs text-[color:var(--sf-text)]/70">Connected</div>
                     <div className="mb-3 text-sm font-semibold text-[color:var(--sf-text)]">{truncate(address)}</div>
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
                       className="w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[color:var(--sf-text)] hover:bg-white/90"
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
                       className="w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[color:var(--sf-text)] hover:bg-white/90"
                     >
                       CONNECT WALLET
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


