import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ar from './locales/ar.json';
import fr from './locales/fr.json';

export type AppLanguage = 'en' | 'ar' | 'fr';

export const RTL_LANGUAGES: AppLanguage[] = ['ar'];

export function isRtlLanguage(lang: AppLanguage): boolean {
  return RTL_LANGUAGES.includes(lang);
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
      fr: { translation: fr },
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

export default i18n;
