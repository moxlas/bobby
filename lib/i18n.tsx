import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import en from '../locales/en.json';
import lt from '../locales/lt.json';

export type Language = 'en' | 'lt';

const messages: Record<Language, any> = { en, lt };

function resolve(lang: Language, key: string): any {
  const keys = key.split('.');
  let value: any = messages[lang];
  for (const k of keys) {
    if (value == null) return undefined;
    value = value[k];
  }
  return value;
}

export function translate(lang: Language, key: string, replacements?: Record<string, string | number>): string {
  const value = resolve(lang, key);
  if (typeof value !== 'string') return key;
  if (replacements) {
    return value.replace(/\{(\w+)\}/g, (_, prop) => String(replacements[prop] ?? `{${prop}}`));
  }
  return value;
}

export function translateArray(lang: Language, key: string): any[] {
  const value = resolve(lang, key);
  return Array.isArray(value) ? value : [];
}

export const LANGUAGES: { code: Language; name: string; badge: string }[] = [
  { code: 'en', name: 'English', badge: 'ENG' },
  { code: 'lt', name: 'Lietuvių', badge: 'LTU' },
];

const LANGUAGE_STORAGE_KEY = 'bobby-language';

export function loadLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === 'en' || saved === 'lt') return saved;
  } catch {}
  return 'en';
}

export function saveLanguage(lang: Language): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {}
}

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, replacements?: Record<string, string | number>) => string;
  tArray: (key: string) => any[];
}

const I18nContext = createContext<I18nContextType>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key,
  tArray: () => [],
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(loadLanguage);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    saveLanguage(lang);
  };

  const t = (key: string, replacements?: Record<string, string | number>) =>
    translate(language, key, replacements);

  const tArray = (key: string) =>
    translateArray(language, key);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, tArray }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}
