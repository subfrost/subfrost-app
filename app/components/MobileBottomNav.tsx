'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ArrowLeftRight, Vault, TrendingUp } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { t } = useTranslation();

  const navItems = [
    { href: '/', label: t('nav.home'), icon: Home },
    { href: '/swap', label: t('nav.swap'), icon: ArrowLeftRight },
    { href: '/vaults', label: t('nav.vaults'), icon: Vault },
    { href: '/futures', label: t('nav.futures'), icon: TrendingUp },
  ];

  const isActive = (path: string) => {
    if (path === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(path);
  };

  return (
    <nav className="fixed bottom-4 left-4 right-4 z-50 md:hidden rounded-2xl bg-[color:var(--sf-glass-bg)]/60 backdrop-blur-md shadow-lg">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                active
                  ? 'text-[color:var(--sf-primary)]'
                  : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              <span className="text-[10px] font-semibold">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
