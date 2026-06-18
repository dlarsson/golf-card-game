import i18next from 'i18next';

export const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'sv', label: 'Svenska' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' },
];

export const supportedLanguages = languageOptions.map((language) => language.value);
export const languageStorageKey = 'golf-language';

const localeLoaders = {
  en: () => import('./locales/en'),
  sv: () => import('./locales/sv'),
  es: () => import('./locales/es'),
  de: () => import('./locales/de'),
};

i18next.init({
  resources: {},
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
    prefix: '{',
    suffix: '}',
  },
});

export async function loadLanguage(language) {
  const active = resolveLanguage(language) || 'en';
  if (!i18next.hasResourceBundle(active, 'translation')) {
    const messages = await localeLoaders[active]();
    i18next.addResourceBundle(active, 'translation', messages.default, true, true);
  }

  await i18next.changeLanguage(active);
  return active;
}

export function createTranslator(language) {
  const active = supportedLanguages.includes(language) ? language : 'en';
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
