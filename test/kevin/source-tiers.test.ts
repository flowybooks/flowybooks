import { describe, expect, it } from 'vitest';

import { assertAllowedAuthorityUrl, validateAnswerLabelForSources } from '@/lib/kevin/source-tiers';

describe('Kevin source tiers', () => {
  it('allows federal tax authority and blocks arbitrary domains', () => {
    expect(() =>
      assertAllowedAuthorityUrl('https://www.irs.gov/pub/irs-pdf/p946.pdf'),
    ).not.toThrow();
    expect(() => assertAllowedAuthorityUrl('https://example.com/tax-advice')).toThrow(
      /not allowed/i,
    );
  });

  it('marks tax answers unsupported when no tax authority is cited', () => {
    const label = validateAnswerLabelForSources({
      answer_type: 'tax',
      authority_level: 'primary',
      sources_used: ['https://fasb.org/example'],
      cannot_answer_from_allowlist: false,
    });

    expect(label.cannot_answer_from_allowlist).toBe(true);
  });

  it('requires both IRS and congressional sources for tax conclusions', () => {
    const irsOnly = validateAnswerLabelForSources({
      answer_type: 'tax',
      authority_level: 'primary',
      sources_used: ['https://www.irs.gov/publications/p946'],
      cannot_answer_from_allowlist: false,
    });
    const complete = validateAnswerLabelForSources({
      answer_type: 'tax',
      authority_level: 'primary',
      sources_used: [
        'https://www.irs.gov/publications/p946',
        'https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title26-section168',
      ],
      cannot_answer_from_allowlist: false,
    });

    expect(irsOnly.cannot_answer_from_allowlist).toBe(true);
    expect(complete.cannot_answer_from_allowlist).toBe(false);
  });

  it('drops non-URL source strings and fails closed for authority conclusions', () => {
    const label = validateAnswerLabelForSources({
      answer_type: 'tax',
      authority_level: 'primary',
      sources_used: ['internal ledger', 'IRS Publication 946'],
      cannot_answer_from_allowlist: false,
    });

    expect(label.sources_used).toEqual([]);
    expect(label.cannot_answer_from_allowlist).toBe(true);
  });

  it('keeps GAAP answers supported when a FASB source is cited', () => {
    const label = validateAnswerLabelForSources({
      answer_type: 'gaap',
      authority_level: 'primary',
      sources_used: ['https://asc.fasb.org/example'],
      cannot_answer_from_allowlist: false,
    });

    expect(label.cannot_answer_from_allowlist).toBe(false);
  });

  it('downgrades uncited bookkeeping answers to educational authority', () => {
    const label = validateAnswerLabelForSources({
      answer_type: 'bookkeeping',
      authority_level: 'official_guidance',
      sources_used: [],
      cannot_answer_from_allowlist: false,
    });

    expect(label.authority_level).toBe('educational');
  });
});
