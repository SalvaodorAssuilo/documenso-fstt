import { describe, expect, it } from 'vitest';

import { extractLocaleData, extractLocaleDataFromHeaders } from './i18n';

const headers = (acceptLanguage?: string) => new Headers(acceptLanguage ? { 'accept-language': acceptLanguage } : {});

/**
 * FSTT: os signatários estão em Angola. Os navegadores enviam `pt-AO` / `pt-PT`,
 * que têm de resolver para a tradução portuguesa disponível (`pt-BR`), e na
 * ausência de qualquer correspondência o idioma por defeito é português, não inglês.
 */
describe('extractLocaleData', () => {
  it('resolves pt-PT and pt-AO to the available Portuguese translation', () => {
    expect(extractLocaleData({ headers: headers('pt-PT,pt;q=0.9,en;q=0.8') }).lang).toBe('pt-BR');
    expect(extractLocaleData({ headers: headers('pt-AO,pt;q=0.9') }).lang).toBe('pt-BR');
    expect(extractLocaleData({ headers: headers('pt') }).lang).toBe('pt-BR');
  });

  it('keeps exact matches for other supported languages', () => {
    expect(extractLocaleData({ headers: headers('en-GB,en;q=0.9') }).lang).toBe('en');
    expect(extractLocaleData({ headers: headers('fr-FR') }).lang).toBe('fr');
    expect(extractLocaleData({ headers: headers('pt-BR') }).lang).toBe('pt-BR');
  });

  it('falls back to Portuguese when nothing matches or the header is missing', () => {
    expect(extractLocaleData({ headers: headers() }).lang).toBe('pt-BR');
    expect(extractLocaleData({ headers: headers('xx-YY') }).lang).toBe('pt-BR');
  });
});

describe('extractLocaleDataFromHeaders', () => {
  it('resolves pt-PT to pt-BR', () => {
    expect(extractLocaleDataFromHeaders(headers('pt-PT')).lang).toBe('pt-BR');
  });

  it('returns null when the language is unsupported', () => {
    expect(extractLocaleDataFromHeaders(headers('xx-YY')).lang).toBeNull();
  });
});
