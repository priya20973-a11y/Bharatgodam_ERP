'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { en, gu } from '@/lib/i18n/cold/dictionaries';
import { toGujaratiDigits } from '@/lib/utils/cold-numbers';

type LanguageContextType = {
  language: 'en' | 'gu';
  t: (keyPath: string) => string;
  formatNumber: (value: number | string | null | undefined) => string;
};

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  t: (keyPath: string): string => {
    const keys = keyPath.split('.');
    let current: any = en;
    for (const key of keys) {
      if (current[key] === undefined) return keyPath;
      current = current[key];
    }
    return typeof current === 'string' ? current : keyPath;
  },
  formatNumber: (value: number | string | null | undefined): string => {
    return value !== null && value !== undefined ? String(value) : '';
  }
});

export function ColdLanguageProvider({
  children,
  language = 'en',
}: {
  children: ReactNode;
  language?: 'en' | 'gu';
}) {
  const t = (keyPath: string): string => {
    const keys = keyPath.split('.');
    let current: any = language === 'gu' ? gu : en;

    for (const key of keys) {
      if (current[key] === undefined) {
        return keyPath; // Fallback to key if not found
      }
      current = current[key];
    }

    if (typeof current === 'string') {
      return current;
    }
    return keyPath;
  };

  const formatNumber = (value: number | string | null | undefined): string => {
    if (value === null || value === undefined) return '';
    const strValue = String(value);
    if (language === 'gu') {
      return toGujaratiDigits(strValue);
    }
    return strValue;
  };

  return (
    <LanguageContext.Provider value={{ language, t, formatNumber }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useColdTranslation() {
  const context = useContext(LanguageContext);
  if (!context) {
    // Safe fallback for Dry Storage / shared components
    return {
      language: 'en' as const,
      t: (keyPath: string): string => {
        const keys = keyPath.split('.');
        let current: any = en;
        for (const key of keys) {
          if (current[key] === undefined) return keyPath;
          current = current[key];
        }
        return typeof current === 'string' ? current : keyPath;
      },
      formatNumber: (value: number | string | null | undefined): string => {
        return value !== null && value !== undefined ? String(value) : '';
      }
    };
  }
  return context;
}
