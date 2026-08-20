import { z } from 'zod';

export const SUPPORTED_LANGUAGE_CODES = ['de', 'en', 'fr', 'es', 'it', 'nl', 'pl', 'pt-BR', 'ja', 'ko', 'zh'] as const;

export type SupportedLanguageCodes = (typeof SUPPORTED_LANGUAGE_CODES)[number];

export const APP_I18N_OPTIONS = {
  supportedLangs: SUPPORTED_LANGUAGE_CODES,
  sourceLang: 'en',
  /**
   * FSTT: idioma usado quando o navegador/definições não indicam um idioma suportado.
   * `sourceLang` continua a ser `en` porque é o idioma-fonte das traduções (Lingui).
   */
  defaultLang: 'pt-BR',
  defaultLocale: 'pt-PT',
} as const;

export const ZSupportedLanguageCodeSchema = z.enum(SUPPORTED_LANGUAGE_CODES).catch('pt-BR');
