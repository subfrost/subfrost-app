import { useCallback, useMemo } from 'react';
import { useLanguage, type Locale } from '@/context/LanguageContext';
import en from '@/i18n/en';
import zh from '@/i18n/zh';

const dictionaries: Record<Locale, Record<string, string>> = { en, zh };

export function useTranslation() {
  const { locale } = useLanguage();

  const dict = useMemo(() => dictionaries[locale], [locale]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      let value = dict[key] ?? dictionaries.en[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return value;
    },
    [dict]
  );

  return { t, locale };
}
