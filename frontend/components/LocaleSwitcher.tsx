'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { locales, localeNames, LOCALE_COOKIE, type Locale } from '@/i18n/config';

export default function LocaleSwitcher() {
  const t = useTranslations('LocaleSwitcher');
  const activeLocale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onChange(next: Locale) {
    // Persist the choice in the locale cookie read by i18n/request.ts, then
    // refresh so server components re-render with the new catalog.
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <label className="inline-flex items-center gap-1 text-sm">
      <span className="sr-only">{t('label')}</span>
      <select
        aria-label={t('label')}
        value={activeLocale}
        disabled={isPending}
        onChange={(e) => onChange(e.target.value as Locale)}
        className="bg-transparent border border-white/20 rounded-md px-2 py-1 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {locales.map((loc) => (
          <option key={loc} value={loc} className="bg-[#060609]">
            {localeNames[loc]}
          </option>
        ))}
      </select>
    </label>
  );
}
