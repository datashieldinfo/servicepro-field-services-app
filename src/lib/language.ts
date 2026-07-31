/**
 * Switching between Arabic and English.
 *
 * The i18n setup already persists the choice and flips `document.dir` on the
 * `languageChanged` event — this is only the toggle itself, which the navbar
 * and the login screen each used to declare for themselves.
 */

import i18n from '../i18n';

export function toggleLanguage(): void {
  i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar');
}
