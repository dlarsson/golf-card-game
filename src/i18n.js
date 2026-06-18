import i18next from 'i18next';
import en from './locales/en';
import sv from './locales/sv';
import es from './locales/es';
import de from './locales/de';

export const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'sv', label: 'Svenska' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' },
];

export const supportedLanguages = languageOptions.map((language) => language.value);
export const languageStorageKey = 'golf-language';

const resources = {
  en: { translation: en },
  sv: { translation: sv },
  es: { translation: es },
  de: { translation: de },
};

i18next.init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
    prefix: '{',
    suffix: '}',
  },
});

export function createTranslator(language) {
  const active = supportedLanguages.includes(language) ? language : 'en';
  i18next.changeLanguage(active);
  const fixedT = i18next.getFixedT(active);
  return (key, values = {}, fallback = key) => fixedT(key, { ...values, defaultValue: fallback });
}

export function resolveLanguage(language) {
  if (!language) return null;
  const normalized = String(language).toLowerCase();
  const exact = supportedLanguages.find((supported) => supported.toLowerCase() === normalized);
  if (exact) return exact;
  const base = normalized.split('-')[0];
  return supportedLanguages.find((supported) => supported === base) || null;
}

export function getBrowserLanguage() {
  if (typeof navigator === 'undefined') return 'en';
  const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return browserLanguages.map(resolveLanguage).find(Boolean) || 'en';
}

export function getInitialLanguage() {
  if (typeof window === 'undefined') return 'en';
  return resolveLanguage(window.localStorage.getItem(languageStorageKey)) || getBrowserLanguage();
}
