const fs = require('fs');
const content = fs.readFileSync('src/i18n/translations.ts', 'utf-8');
const enStart = content.indexOf('en: {');
const end = content.lastIndexOf('},');
const newContent = `import { Language } from '../types';

export const translations = {
  ` + content.substring(enStart, end + 1) + `
};

export function useTranslation(lang: Language) {
  return translations.en;
}
`;
fs.writeFileSync('src/i18n/translations.ts', newContent);
