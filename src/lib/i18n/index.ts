import { browser } from '$app/environment';
import { addMessages, init, locale } from 'svelte-i18n';
import en from './en.json';
import am from './am.json';
import om from './om.json';

const STORAGE_KEY = 'locale';
const DEFAULT_LOCALE = 'en';

addMessages('en', en);
addMessages('am', am);
addMessages('om', om);

const initialLocale = browser ? (localStorage.getItem(STORAGE_KEY) ?? DEFAULT_LOCALE) : DEFAULT_LOCALE;

init({
  fallbackLocale: DEFAULT_LOCALE,
  initialLocale,
});

export function setLocale(lang: string) {
  locale.set(lang);
  if (browser) localStorage.setItem(STORAGE_KEY, lang);
}

export function localeAbbr(loc: string | null | undefined): string {
  if (loc === 'am') return 'AMH';
  if (loc === 'om') return 'ORO';
  return 'ENG';
}

export { locale };
