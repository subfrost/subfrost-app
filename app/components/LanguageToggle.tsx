'use client';

import { useLanguage } from '@/context/LanguageContext';

export default function LanguageToggle() {
  const { locale, toggleLocale } = useLanguage();
  const isZh = locale === 'zh';

  return (
    <button
      type="button"
      onClick={toggleLocale}
      className={`text-base font-bold transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
        isZh ? 'text-[color:var(--sf-primary)]' : 'text-[color:var(--sf-muted)]'
      }`}
      aria-label={`Switch to ${isZh ? 'English' : 'Chinese'}`}
    >
      文
    </button>
  );
}
